// Local-only object storage for the one upload path this app has (avatars).
// Files live in memory as blob: URLs for the lifetime of the tab — nothing is
// ever sent anywhere.

const blobs = new Map<string, Blob>();

export const mockStorage = {
    from(_bucket: string) {
        return {
            async upload(path: string, file: Blob) {
                blobs.set(path, file);
                return { data: { path }, error: null };
            },
            getPublicUrl(path: string) {
                const blob = blobs.get(path);
                const url = blob ? URL.createObjectURL(blob) : '';
                return { data: { publicUrl: url } };
            },
            async remove(paths: string[]) {
                paths.forEach(p => blobs.delete(p));
                return { data: null, error: null };
            }
        };
    }
};
