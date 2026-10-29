import { HAPFileStorage } from "./HAPFileStorage";
/**
 * @group Model
 */
export declare class HAPStorage {
    private static readonly INSTANCE;
    private localStore?;
    private customStoragePath?;
    static storage(): HAPFileStorage;
    static setCustomStoragePath(path: string): void;
    storage(): HAPFileStorage;
    /**
     * Warn early if the persist directory cannot be written to.
     *
     * Without this the first sign of trouble is a publish failing with an
     * unrelated-looking error, which is what happens when a container that
     * previously ran as root is switched to a non-root user and the existing
     * AccessoryInfo/IdentifierCache files stay owned by root.
     *
     * Only warns — an unwritable directory is not necessarily fatal at this
     * point, and throwing here would break consumers that never write.
     */
    private checkStorageIsWritable;
    setCustomStoragePath(path: string): void;
}
//# sourceMappingURL=HAPStorage.d.ts.map