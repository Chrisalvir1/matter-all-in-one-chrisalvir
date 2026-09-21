export type Binary = Buffer | NodeJS.TypedArray | DataView;
export type BinaryLike = string | Binary;
export declare const BASE_UUID = "-0000-1000-8000-0026BB765291";
export declare function generate(data: BinaryLike): string;
export declare function isValid(UUID: string): boolean;
/**
 * Parses the uuid as a string from the given Buffer.
 * The parser will use the first 8 bytes.
 *
 * @param buf - The buffer to read from.
 */
export declare function unparse(buf: Buffer): string;
/**
 * Parses the uuid as a string from the given Buffer at the specified offset.
 * @param buf - The buffer to read from.
 * @param offset - The offset in the buffer to start reading from.
 */
export declare function unparse(buf: Buffer, offset: number): string;
export declare function write(uuid: string): Buffer;
export declare function write(uuid: string, buf: Buffer, offset: number): void;
export declare function toShortForm(uuid: string, base?: string): string;
export declare function toLongForm(uuid: string, base?: string): string;
//# sourceMappingURL=uuid.d.ts.map