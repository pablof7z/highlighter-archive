<script lang="ts">
    import GlobalIcon from '$lib/icons/Global.svelte';
</script>

<div class="max-w-prose text-lg flex flex-col gap-4">
    <div class="text-4xl font-semibold flex flex-row gap-2 items-center">
        Welcome to
        ATLAS
        <GlobalIcon />
    </div>

    <div class="overflow-hidden rounded-lg bg-white shadow p-6 flex flex-col gap-6">
        <p>
            Atlas is an <em>experiment</em> of what a
            personal/team knowledge management system looks like
            when leveraging the global content addressability Nostr
            provides.
        </p>

        <p>
            The fact that Atlas is <b class="text-orange-500">alpha</b> software can't be oversated;
            don't expect a fully functional product yet.
        </p>

        <div class="text-2xl font-semibold">Some things you can do with Atlas</div>

        <p>
            Organize your highlights that you have marked from highlighter.com
        </p>
    </div>
</div>