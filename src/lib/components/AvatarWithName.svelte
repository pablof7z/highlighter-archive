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

<div class="group block flex-shrink-0">
    <div class="flex items-center gap-2">
        <div>
            <Avatar {userProfile} klass="w-10 h-10" />
        </div>
        <div>
            <p class="text-sm font-medium text-gray-700 group-hover:text-gray-900"><Name {userProfile} /></p>
            <div class="text-xs text-gray-500 truncate">
                {#if subtitle}
                    {subtitle}
                {:else}
                    {userProfile?.about?.slice(0, 50)}
                {/if}
            </div>
        </div>
    </div>
</div>
