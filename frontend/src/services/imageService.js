import { db } from '../db/index.js';
import { apiFetch } from '../api';
import imageCompression from 'browser-image-compression';

class ImageService {
    async compressImage(file, maxSizeMB = 0.5) {
        return await imageCompression(file, { maxSizeMB, maxWidthOrHeight: 1024, useWebWorker: true });
    }

    async captureImage() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg,image/png,image/webp';
            input.capture = 'environment';
            input.onchange = (e) => resolve(e.target.files[0] || null);
            input.click();
        });
    }

    async uploadImage(compressedFile) {
        const ct = compressedFile.type;
        const res = await apiFetch(`/evidence/presigned-url?content_type=${encodeURIComponent(ct)}`);
        if (!res.ok) throw new Error('Failed to get presigned URL');
        const { presigned_data, key } = await res.json();
        const form = new FormData();
        Object.entries(presigned_data.fields).forEach(([k, v]) => form.append(k, v));
        form.append('file', compressedFile);
        const uploadResp = await fetch(presigned_data.url, { method: 'POST', body: form });
        if (!uploadResp.ok && uploadResp.status !== 204) throw new Error('Upload failed');
        return key;
    }

    async addImageToRemark(remarkLocalUuid, type) {
        const rawFile = await this.captureImage();
        if (!rawFile) return null;
        const compressed = await this.compressImage(rawFile);
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
