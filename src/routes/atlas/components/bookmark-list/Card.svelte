<script lang="ts">
    export let bookmarkList: App.BookmarkList;
</script>

<a href="/atlas/bookmarks/{bookmarkList.naddr}" class="flex flex-col">
    <div class="
        shadow
        flex flex-col h-full gap-4
        border border-zinc-200 hover:border-zinc-200
        px-6 pt-6 pb-4 rounded-xl
        bg-white hover:bg-slate-50 transition duration-200 ease-in-out
    " style="max-height: 40rem;">
        <div class="flex-1 truncate px-4 py-2 text-sm">
            <div class="text-lg font-medium text-gray-900 hover:text-gray-600">
                {bookmarkList.title}
            </div>
            <div class="flex flex-row gap-4 items-start text-sm text-zinc-400">
                {new Date(bookmarkList.createdAt).toLocaleString()}
            </div>
        </div>
    </div>
</a>