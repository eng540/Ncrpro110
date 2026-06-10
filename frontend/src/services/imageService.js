import { db } from '../db/index.js';
import imageCompression from 'browser-image-compression';
import heic2any from 'heic2any';

class ImageService {
    // ✅ دالة مساعدة للتحقق من صحة Blob
    ensureValidBlob(file, context = '') {
        if (!file) {
            throw new Error(`الملف غير موجود ${context ? `في ${context}` : ''}`);
        }
        if (!(file instanceof Blob) && !(file instanceof File)) {
            throw new Error(`الكائن ليس من نوع Blob/File ${context ? `في ${context}` : ''}`);
        }
        if (file.size === 0) {
            throw new Error(`الملف فارغ (حجم 0 بايت) ${context ? `في ${context}` : ''}`);
        }
        return true;
    }

    async compressImage(file, maxSizeMB = 0.5) {
        // ✅ فحص صحة المدخلات
        this.ensureValidBlob(file, 'compressImage');

        try {
            const options = {
                maxSizeMB,
                maxWidthOrHeight: 1024,
                useWebWorker: true,
            };

            // محاولة الضغط
            const compressed = await imageCompression(file, options);

            // ✅ فحص النتيجة
            if (!compressed) {
                throw new Error('مكتبة الضغط أعادت null أو undefined');
            }
            if (!(compressed instanceof Blob)) {
                throw new Error(`النتيجة ليست من نوع Blob: ${typeof compressed}`);
            }

            return compressed;
        } catch (err) {
            console.error(`فشل ضغط الصورة (${file.name}, size: ${file.size}):`, err);

            // ✅ آلية احتياطية: إذا كان حجم الملف الأصلي أقل من 5 ميجابايت، استخدمه كما هو
            const MAX_FALLBACK_SIZE = 5 * 1024 * 1024; // 5 MB
            if (file.size <= MAX_FALLBACK_SIZE) {
                console.warn(`استخدام الملف الأصلي بدلاً من المضغوط (حجمه ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
                return file; // إعادة الملف الأصلي كـ "compressed"
            }

            // إذا فشل الضغط والملف كبير جداً، أعد إلقاء الخطأ مع رسالة واضحة
            throw new Error(`فشل ضغط الصورة (حجمها ${(file.size / 1024 / 1024).toFixed(2)} MB). حاول استخدام صورة أصغر.`);
        }
    }

    async captureImage() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.capture = 'environment';
            input.onchange = (e) => resolve(e.target.files[0] || null);
            input.click();
        });
    }

    async convertHeicToJpeg(heicFile) {
        try {
            const blob = await heic2any({
                blob: heicFile,
                toType: 'image/jpeg',
                quality: 0.9
            });
            const jpegBlob = Array.isArray(blob) ? blob[0] : blob;
            return new File([jpegBlob], heicFile.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
        } catch (err) {
            console.error('HEIC conversion failed:', err);
            throw new Error('فشل تحويل الصورة من صيغة HEIC إلى JPEG');
        }
    }

    async uploadImage(compressedFile) {
        // ✅ التحقق من صحة الملف
        if (!compressedFile) {
            throw new Error('الملف المضغوط غير موجود');
        }
        if (!(compressedFile instanceof Blob) && !(compressedFile instanceof File)) {
            throw new Error('الملف ليس من نوع Blob/File');
        }
        if (compressedFile.size === 0) {
            throw new Error('الملف المضغوط فارغ (حجم 0 بايت)');
        }
        const ct = compressedFile.type;
        if (!ct || !ct.startsWith('image/')) {
            throw new Error(`نوع الملف غير مدعوم: ${ct || 'غير معروف'}`);
        }

        const formData = new FormData();
        formData.append('file', compressedFile);

        // ✅ استخدام fetch مباشرة لتجنب تداخل apiFetch مع Content-Type
        const token = localStorage.getItem('nrc_token');
        const baseURL = process.env.REACT_APP_API_URL || '';
        const url = `${baseURL}/api/evidence/upload`;

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${token}`
                // لا نضيف Content-Type – المتصفح يضبطه تلقائياً مع الـ boundary
            }
        });

        if (!response.ok) {
            let errorMsg = `فشل رفع الصورة: ${response.status}`;
            try {
                const errData = await response.json();
                errorMsg = errData.detail || errorMsg;
            } catch (e) {
                errorMsg = await response.text() || errorMsg;
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        return data.key;
    }

    async addImageToRemark(remarkLocalUuid, type) {
        const rawFile = await this.captureImage();
        if (!rawFile) return null;

        let fileToProcess = rawFile;
        const isHeic = rawFile.type === 'image/heic' || 
                       rawFile.name?.toLowerCase().endsWith('.heic');

        if (isHeic) {
            console.log('HEIC file detected. Converting to JPEG...');
            try {
                fileToProcess = await this.convertHeicToJpeg(rawFile);
            } catch (err) {
                console.error(err);
                alert('⚠️ هذه الصورة بصيغة HEIC ولم نتمكن من تحويلها تلقائياً. حاول استخدام صيغة JPEG أو PNG.');
                return null;
            }
        }

        let compressed;
        try {
            compressed = await this.compressImage(fileToProcess);
        } catch (err) {
            console.error('Compression step failed:', err);
            alert(`فشل ضغط الصورة: ${err.message}`);
            return null;
        }

        if (navigator.onLine) {
            try {
                return await this.uploadImage(compressed);
            } catch (err) {
                console.error('Upload step failed:', err);
                alert(`فشل رفع الصورة: ${err.message}`);
                return null;
            }
        } else {
            // وضع عدم الاتصال: حفظ الصورة في pending_images
            const pendingId = await db.pending_images.add({
                remark_local_uuid: remarkLocalUuid,
                type: type,
                blob: compressed,
                mime_type: compressed.type,
                sync_status: 'pending',
                created_at: new Date().toISOString()
            });
            return `pending:${pendingId}`;
        }
    }

    async syncPendingImages() {
        const pendings = await db.pending_images.where('sync_status').equals('pending').toArray();
        for (const p of pendings) {
            try {
                const key = await this.uploadImage(p.blob);
                const remark = await db.remarks.where('local_uuid').equals(p.remark_local_uuid).first();
                if (remark) {
                    const field = p.type === 'before' ? 'before_photo_ref' : 'after_photo_ref';
                    await db.remarks.update(remark.id, { [field]: key });
                    const { pushToSyncQueue } = await import('../syncEngine.js');
                    await pushToSyncQueue('UPDATE_REMARK', {
                        id: remark.id,
                        local_uuid: p.remark_local_uuid,
                        [field]: key,
                        last_update: new Date().toISOString()
                    });
                }
                await db.pending_images.delete(p.id);
            } catch (err) {
                console.error(`Failed to sync image ${p.id}`, err);
            }
        }
    }
}

export const imageService = new ImageService();
