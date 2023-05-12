<script lang="ts">
    import { page } from '$app/stores';
    import UserInterface from '$lib/interfaces/users';
    import { backgroundBanner } from '$lib/store';
    import ndk from "$lib/stores/ndk";
    import type { NDKUser } from '@nostr-dev-kit/ndk';
    import NpubHighlights from './npub-highlights.svelte';

    let { npub } = $page.params;
    let user: NDKUser;
    let hexpubkey: string;

    if (npub.startsWith('npub')) {
        const user = $ndk.getUser({npub})
        hexpubkey = user.hexpubkey();
    } else {
        hexpubkey = npub;
        user = $ndk.getUser({hexpubkey});
    }

    let userProfile = UserInterface.get({ hexpubkey });

    $: if ($userProfile?.banner) {
        $backgroundBanner = $userProfile?.banner;
    } else {
        $backgroundBanner = null;
    }
</script>

<NpubHighlights pubkey={hexpubkey} />

    <!-- <div slot="sidebar">
        <div class="flex flex-col max-w-prose mx-auto gap-8">
            <UserBanner pubkey={hexpubkey} />
        </div>
    </div> -->