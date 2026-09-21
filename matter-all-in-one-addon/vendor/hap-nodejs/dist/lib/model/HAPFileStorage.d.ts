/**
 * Init options supported by {@link HAPFileStorage.initSync}.
 *
 * This is the subset of node-persist's init options which was ever functional for HAP-NodeJS's storage.
 * Passing any other node-persist option throws instead of being silently ignored.
 *
 * @group Model
 */
export interface HAPFileStorageInitOptions {
    /**
     * Path of the storage directory. If provided, it must be an absolute path.
     * If omitted, storage defaults to the directory `persist` inside the current working directory.
     */
    dir?: string;
}
/**
 * Minimal synchronous file storage, a drop-in replacement for the subset of `node-persist@0.0.12`
 * which HAP-NodeJS used: `initSync`, `getItem`, `setItemSync` and `removeItemSync`.
 *
 * The on-disk layout is kept byte-for-byte compatible with node-persist 0.0.12:
 * one file per key inside the storage directory, named after the raw key (no hashing or escaping),
 * containing the bare `JSON.stringify` representation of the value. Values are read once
 * at {@link initSync} and served from memory afterwards.
 *
 * Keys must therefore be plain filenames: one which names a subdirectory, escapes the storage directory
 * or starts with a dot is rejected rather than written somewhere it could never be read back from.
 *
 * Writes are atomic, which node-persist's were not: see {@link setItemSync}.
 *
 * @group Model
 */
export declare class HAPFileStorage {
    private dir;
    private readonly data;
    constructor();
    initSync(options?: HAPFileStorageInitOptions): void;
    /**
     * Returns the in-memory value for the given key.
     * node-persist's legacy `getItem(key, callback)` form throws, like every other removed API.
     */
    getItem(key: string, ...legacyCallback: never[]): any;
    /**
     * Persists the given value, replacing the file for this key atomically.
     *
     * The value is written to a temporary file which is then renamed over the target, so an interrupted write
     * leaves the previous contents intact instead of a truncated file. This matters because a truncated
     * `AccessoryInfo` file reads back as an accessory which lost its pairings.
     *
     * The in-memory value is only replaced once the new one reached the disk, so a failed write cannot leave
     * an accessory which reads as paired now and unpaired after a restart.
     */
    setItemSync(key: string, value: any): void;
    removeItemSync(key: string): void;
    /**
     * Rejects a key which is not a plain filename, before it reaches the filesystem.
     *
     * `path.join` would otherwise read a key as a path: `nested/key.json` writes into a subdirectory which
     * {@link initSync} skips, so the value comes back `undefined` after a restart, and `../escaped.json` writes
     * outside the storage directory altogether. node-persist 0.0.12 created such subdirectories too, but crashed
     * with `EISDIR` on the next load rather than losing the value quietly.
     *
     * A leading dot is rejected for the same reason: {@link initSync} skips dotfiles, so `.hidden` would be
     * written, served from memory while the process runs, and then be gone after a restart.
     */
    private static assertPlainKey;
    /**
     * Whether the given path is a regular file, following symlinks.
     *
     * An entry which cannot be stat'ed at all, like a broken or circular symlink, is one to skip
     * rather than one to abort startup over.
     */
    private static isFile;
    private static parse;
}
//# sourceMappingURL=HAPFileStorage.d.ts.map