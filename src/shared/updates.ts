/**
 * The part of an install failure that means the signature did not check out,
 * rather than the download or the disk failing. Kept in step by hand with
 * `install_failure` in src-tauri/src/lib.rs, which is where the sentence the
 * user reads is written.
 */
export const UNVERIFIED = "couldn't be verified";
