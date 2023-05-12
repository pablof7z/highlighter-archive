import { writable } from 'svelte/store';
import type {NDKUser} from '@nostr-dev-kit/ndk';

export const currentUser = writable<NDKUser | null>(null);
export const currentUserFollowPubkeys = writable<string[] | undefined>(undefined);
export const backgroundBanner = writable<string | null>(null);

export type ScopeSelection = {
    label: string;
    pubkeys: string[] | undefined;
};
export const currentScope = writable<ScopeSelection>({
    label: 'global',
    pubkeys: undefined,
});

let zapEvent: any;

export const zap = writable(zapEvent);