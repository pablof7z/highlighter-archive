import { get as getStore } from 'svelte/store';
import { currentUser as currentUserStore } from '$lib/store';
import { currentUserFollowPubkeys as currentUserFollowPubkeysStore } from '$lib/store';
import type { NDKUser } from '@nostr-dev-kit/ndk';

export function fetchFollowers() {
    const $currentUser = getStore(currentUserStore);

    if (!$currentUser) {
        setTimeout(fetchFollowers, 1000);
        return;
    }

    const followsPromise = new Promise((resolve, reject) => {
        $currentUser?.follows().then((follows) => {
            console.log(`received ${follows.size} follows`);
            currentUserFollowPubkeysStore.set(
                Array.from(follows).map((u: NDKUser) => u.hexpubkey())
            );
            resolve(true);
        });
    });

    return followsPromise;
}