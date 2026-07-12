// End-to-end encryption for the sync relay.
//
// Uses tweetnacl `secretbox` (XSalsa20-Poly1305) with a key derived from a
// passphrase via scrypt. Everything here is pure JS so the SAME format can be
// produced by Scriptable on the iPhone (see CountriesAYearSync.js).
//
// Blob layout (then base64-encoded):  salt[16] ‖ nonce[24] ‖ secretbox
//
// The relay only ever sees this base64 blob; the passphrase never leaves the device.

import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import scryptJs from 'scrypt-js';
import type { LocationEntry } from './types';

const { scrypt } = scryptJs;

const SALT_LEN = 16;
const NONCE_LEN = nacl.secretbox.nonceLength; // 24
const KEY_LEN = nacl.secretbox.keyLength; // 32

// scrypt work factors. N=2^15 is a sensible balance: strong against brute force,
// yet ~a few hundred ms on a phone/browser (runs at most once per sync).
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
	const pw = util.decodeUTF8(passphrase.normalize('NFKC'));
	return scrypt(pw, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LEN);
}

function randomBytes(n: number): Uint8Array {
	const b = new Uint8Array(n);
	crypto.getRandomValues(b);
	return b;
}

/** Encrypt entries into a base64 blob ready to upload to the relay. */
export async function encryptEntries(entries: LocationEntry[], passphrase: string): Promise<string> {
	const salt = randomBytes(SALT_LEN);
	const nonce = randomBytes(NONCE_LEN);
	const key = await deriveKey(passphrase, salt);
	const box = nacl.secretbox(util.decodeUTF8(JSON.stringify(entries)), nonce, key);

	const packed = new Uint8Array(SALT_LEN + NONCE_LEN + box.length);
	packed.set(salt, 0);
	packed.set(nonce, SALT_LEN);
	packed.set(box, SALT_LEN + NONCE_LEN);
	return util.encodeBase64(packed);
}

/** Decrypt a base64 blob from the relay back into entries. Throws if the passphrase is wrong. */
export async function decryptEntries(blobB64: string, passphrase: string): Promise<LocationEntry[]> {
	const packed = util.decodeBase64(blobB64.trim());
	if (packed.length <= SALT_LEN + NONCE_LEN) throw new Error('blob-too-short');

	const salt = packed.slice(0, SALT_LEN);
	const nonce = packed.slice(SALT_LEN, SALT_LEN + NONCE_LEN);
	const box = packed.slice(SALT_LEN + NONCE_LEN);
	const key = await deriveKey(passphrase, salt);

	const msg = nacl.secretbox.open(box, nonce, key);
	if (!msg) throw new Error('decrypt-failed'); // wrong passphrase or corrupt data
	return JSON.parse(util.encodeUTF8(msg));
}

/** Generate a random 128-bit hex id to use as the relay bucket / capability. */
export function generateRelayId(): string {
	return [...randomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a strong random passphrase (192-bit, URL-safe base64). It is never
 * typed by the user: the app generates it, hands it to Scriptable via the
 * deep link, and shows it once as a backup for the user to store.
 */
export function generatePassphrase(): string {
	const bytes = randomBytes(24);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
