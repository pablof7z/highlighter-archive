<script lang="ts">
    import ndk from '$lib/stores/ndk';

    import { findEphemeralSigner, generateEphemeralSigner, saveEphemeralSigner } from '$lib/signers/ephemeral';
    import type { NDKSigner, NDKUser } from '@nostr-dev-kit/ndk';
    import AvatarWithName from '$lib/components/AvatarWithName.svelte';

    export let list: App.BookmarkList;
    export let signer: NDKSigner;
    export let signerUser: NDKUser;
    export let isNewSigner: boolean | undefined = undefined;

    async function findListKey() {
        if (isNewSigner || isNewSigner === undefined) {
            const s = await findEphemeralSigner(
                $ndk,
                $ndk.signer!,
                {
                    name: list?.title || 'bookmark list'
                }
            );

            isNewSigner = !s;

            if (s) {
                signer = s;
                const listUser = await signer.user();
                // currentUserPubkeys.push(listUser.hexpubkey())
                // currentUserPubkeys = currentUserPubkeys;
                // console.log(`found a signer`, currentUserPubkeys);
            } else {
                signer = generateEphemeralSigner();
            }

            signerUser = await signer.user();
        }
    }
</script>

{#await findListKey()}
{:then}
    {#if isNewSigner}
    {:else}
        <AvatarWithName pubkey={signerUser.hexpubkey()}>
            <div slot="bio">
                {signerUser.npub}
            </div>
        </AvatarWithName>
    {/if}
{/await}