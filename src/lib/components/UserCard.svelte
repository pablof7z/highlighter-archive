<script lang="ts">
    import Avatar from '$lib/components/Avatar.svelte';
    import Name from '$lib/components/Name.svelte';
    import UserInterface from '$lib/interfaces/users';
    import type { Observable } from 'dexie';

    export let pubkey: string | undefined;
    export let userProfile: App.UserProfile | undefined = undefined;
    export let subtitle: string | undefined = undefined;
    let prevPubkey: string | undefined = undefined;
    let observeUserProfile: Observable<App.UserProfile> | undefined = undefined;

    $: {
        if (pubkey !== prevPubkey && !userProfile) {
            prevPubkey = pubkey;
            observeUserProfile = UserInterface.get({ hexpubkey: pubkey });
        }

        if (observeUserProfile && $observeUserProfile) {
            userProfile = ($observeUserProfile||{}) as App.UserProfile;
        }
    }
</script>

<div class="
    flex flex-row items-center justify-between gap-12 p-4
    border border-zinc-800 rounded-lg
    overflow-clip
">
    <div class="flex flex-row items-center gap-3">
        <Avatar {userProfile} klass="w-14 h-14" />

        <div class="flex flex-col gap-2">
            <div class="text-base font-semibold whitespace-nowrap w-42 truncate">
                <Name {userProfile} />
            </div>

            {#if subtitle}
                <div class="text-sm text-gray-500">
                    {subtitle}
                </div>
            {/if}
        </div>
    </div>

    <slot name="right-column" />
</div>