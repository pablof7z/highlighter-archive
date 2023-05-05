<script lang="ts">
    import { page } from '$app/stores';
    import { ndk, backgroundBanner } from '$lib/store';

    import HighlightList from '$lib/components/HighlightList.svelte';
    import UserBanner from '$lib/components/UserBanner.svelte';

    import UserInterface from '$lib/interfaces/users';

    const { npub } = $page.params;
    const user = $ndk.getUser({npub})
    const hexpubkey = user.hexpubkey();
    const filter = { pubkeys: [hexpubkey] };
    let userProfile = UserInterface.get({ hexpubkey });

    $: if ($userProfile?.banner) {
        $backgroundBanner = $userProfile?.banner;
    } else {
        $backgroundBanner = null;
    }
</script>

<div class="flex flex-col max-w-prose mx-auto gap-8">
    <UserBanner pubkey={hexpubkey} />

    <div>
        <HighlightList {filter} />
    </div>
</div>