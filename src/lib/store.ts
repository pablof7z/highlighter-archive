import { writable } from 'svelte/store';
import type {NDKUser} from '@nostr-dev-kit/ndk';

export const currentUser = writable<NDKUser | null>(null);
export const currentUserFollowPubkeys = writable<string[] | undefined>([]);
export const backgroundBanner = writable<string | null>(null);

let zapEvent: any;

export const zap = writable(zapEvent);