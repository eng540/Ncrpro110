import { db } from '../db/index.js';
import { apiFetch } from '../api';
import imageCompression from 'browser-image-compression';
import heic2any from 'heic2any';

class ImageService {
    async compressImage(file, maxSizeMB = 0.5) {
        return await imageCompression(file, { maxSizeMB, maxWidthOrHeight: 1024, useWebWorker: true });
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
        const ct = compressedFile.type;
        const res = await apiFetch(`/evidence/presigned-url?content_type=${encodeURIComponent(ct)}`, {
            method: 'POST'
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to get presigned URL: ${res.status} ${errText}`);
        }
        const { upload_url, key } = await res.json();
        
        // ✅ PUT مباشر إلى B2 (بدون FormData)
        const uploadResp = await fetch(upload_url, {
            method: 'PUT',
            body: compressedFile,
            headers: {
                'Content-Type': ct
            }
        });
        
        if (!uploadResp.ok) {
            const errText = await uploadResp.text();
            console.error('B2 upload error:', uploadResp.status, errText);
            throw new Error(`Upload failed: ${uploadResp.status} ${errText}`);
        }
        
        return key;
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

        const compressed = await this.compressImage(fileToProcess);
        if (navigator.onLine) {
            return await this.uploadImage(compressed);
        } else {
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
