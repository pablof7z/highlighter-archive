<main class="pb-8">
    <div class="mx-auto max-w-3xl sm:px-4 lg:max-w-7xl">
        <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-8">
            <div class="grid grid-cols-1 gap-4 lg:col-span-2">
                <slot />
            </div>

            <!-- <div class="grid grid-cols-1 gap-4">
                <section aria-labelledby="section-2-title">
                    <div class="overflow-hidden rounded-lg bg-white shadow">
                        <div class="p-6">
                            <slot name="sidebar" />
                        </div>
                    </div>
                </section>
            </div> -->
        </div>
    </div>
</main>


<style>
    :global(html) {
        background: #fafaff;
    }
</style>