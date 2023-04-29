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
    let event;

    $: {
        if (pubkey !== prevPubkey && !userProfile) {
            prevPubkey = pubkey;
            observeUserProfile = UserInterface.get({ hexpubkey: pubkey });
            // event = new NDKEvent($ndk,
        }

        if (observeUserProfile && $observeUserProfile) {
            userProfile = ($observeUserProfile||{}) as App.UserProfile;
        }
    }
</script>

<div class="
    w-full
    shadow
    flex flex-col h-full gap-4 items-stretch
    border border-zinc-200 hover:border-zinc-200
    px-6 pt-6 pb-4 rounded-xl
    bg-white hover:bg-slate-50 transition duration-200 ease-in-out
    overflow-clip
" style="max-height: 40rem;">
    <div class="flex flex-row gap-4 items-stretch h-full justify-items-stretch">
        <Avatar {userProfile} klass="w-14 h-14" />

        <div class="flex flex-col gap-2 h-full">
            <div class="text-base font-semibold whitespace-nowrap w-42 truncate">
                <Name {userProfile} />
            </div>

            {#if subtitle}
                <div class="text-sm text-gray-500">
                    {subtitle}
                </div>
            {:else if userProfile?.about}
                <div class="text-sm text-gray-500 h-24 overflow-y-auto">
                    {userProfile?.about}
                </div>
            {/if}
        </div>
    </div>

    <slot />
</div>