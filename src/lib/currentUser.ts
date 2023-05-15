import { get as getStore } from 'svelte/store';
import { currentUser as currentUserStore } from '$lib/store';
import { currentUserFollowPubkeys as currentUserFollowPubkeysStore } from '$lib/store';
import type { NDKUser } from '@nostr-dev-kit/ndk';

export async function fetchFollowers(): Promise<void> {
    const $currentUser = getStore(currentUserStore);

    if (!$currentUser) {
        setTimeout(fetchFollowers, 1000);
        return;
    }

    const follows = await $currentUser?.follows()
    const hexpubkeys = Array.from(follows).map((u: NDKUser) => u.hexpubkey());
    const uniqueHexpubkeys = Array.from(new Set(hexpubkeys));
    currentUserFollowPubkeysStore.set(uniqueHexpubkeys);
    console.log(`received ${uniqueHexpubkeys.length} follows`);
}