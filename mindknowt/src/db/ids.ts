/**
 * Local record ids. These never leave the device and are not security
 * sensitive, so a v4-shaped random id is sufficient; there is no crypto
 * dependency to justify here.
 */
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
