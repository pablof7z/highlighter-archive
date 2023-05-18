import type { NDKUser } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";

export async function loadNotesWithTaggedSigner(ndk: NDK, user: NDKUser) {
    return ndk.subscribe({
        '#p': [user.hexpubkey()],
        kinds: [1]
    })
}