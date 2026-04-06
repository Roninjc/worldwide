<script lang="ts">
  import "../app.css";
  import { isLoading } from "$lib/i18n";
  import { t } from "svelte-i18n";
  import { tick } from "svelte";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { themeStore } from "$lib/themeStore.svelte";

  let { children } = $props();

  function setThemeColorMeta(color: string) {
    // Remove existing theme-color metas and create fresh one
    // This forces browsers (especially Chrome on iOS) to re-read the value
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.remove());
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    document.head.appendChild(meta);
  }

  function updateThemeColor() {
    // Wait for styles to be computed after theme change
    requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const color = style.getPropertyValue("--app-bg").trim();
      setThemeColorMeta(color);
    });
  }

  onMount(() => {
    entriesStore.load();
    themeStore.init();
    updateThemeColor();
    // Observa cambios en el atributo data-theme
    const observer = new MutationObserver(updateThemeColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  });

  const navItems = [
    { href: "/", labelKey: "menu.map" },
    { href: "/passport", labelKey: "menu.passport" },
    { href: "/wrapped", labelKey: "menu.wrapped" },
  ];

  function isActive(href: string) {
    const path = $page.url.pathname;
    if (href === "/") return path === "/";
    return path === href || path.startsWith(href + "/");
  }

  // ── Theme ripple transition ──────────────────────────────────────────
  async function toggleTheme(event: MouseEvent) {
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const maxR = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    if (!document.startViewTransition) {
      themeStore.toggle();
      return;
    }

    const transition = document.startViewTransition(() => {
      themeStore.toggle();
    });

    await transition.ready;

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${maxR}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 420,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  }

  // ── Sliding indicator ────────────────────────────────────────────────
  let navRef = $state<HTMLElement | undefined>();
  let indicatorLeft = $state(0);
  let indicatorWidth = $state(0);
  let indicatorVisible = $state(false);

  function updateIndicator() {
    if (!navRef) return;
    const activeLink = navRef.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    if (!activeLink) {
      indicatorVisible = false;
      return;
    }
    const navRect = navRef.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    indicatorLeft = linkRect.left - navRect.left;
    indicatorWidth = linkRect.width;
    indicatorVisible = true;
  }

  $effect(() => {
    void $page.url.pathname;
    tick().then(updateIndicator);
  });

  const syncActive = $derived($page.url.pathname === "/sync");
</script>

<div
  class="h-dvh flex flex-col overflow-hidden"
  style="background: var(--app-bg); color: var(--app-fg);"
>
  {#if $isLoading}
    <div class="flex-1 flex items-center justify-center">
      <span style="color: var(--app-muted)">Loading…</span>
    </div>
  {:else}
    <main class="flex-1 min-h-0 flex flex-col overflow-hidden">
      {@render children()}
    </main>

    <!-- Bottom bar: sync ← [nav pill] → theme -->
    <div
      class="fixed left-0 right-0 z-30 flex items-center px-4"
      style="bottom: var(--nav-bottom);"
    >
      <!-- Left: Sync -->
      <div class="flex-1 flex justify-start">
        <a
          href="/sync"
          class="glass-side-btn w-10 h-10 flex items-center justify-center rounded-full"
          style="
					background: var(--glass-bg);
					border: 1px solid var(--glass-border);
					box-shadow: var(--glass-shadow);
					backdrop-filter: blur(44px) saturate(220%);
					-webkit-backdrop-filter: blur(44px) saturate(220%);
					color: {syncActive ? 'var(--app-fg)' : 'var(--app-muted)'};
				"
          title={$t("sync.title")}
        >
          <svg
            class="w-[17px] h-[17px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
        </a>
      </div>

      <!-- Center: Nav pill -->
      <nav
        bind:this={navRef}
        class="glass-pill flex items-center gap-0.5 px-2 py-1.5 rounded-full"
        style="
				background: var(--glass-bg);
				border: 1px solid var(--glass-border);
				box-shadow: var(--glass-shadow);
				backdrop-filter: blur(44px) saturate(220%);
				-webkit-backdrop-filter: blur(44px) saturate(220%);
			"
      >
        <!-- Sliding active indicator -->
        <div
          style="
					position: absolute;
					top: 4px; bottom: 4px;
					left: {indicatorLeft}px;
					width: {indicatorWidth}px;
					border-radius: 9999px;
					background: rgba(128,128,128,0.20);
					pointer-events: none;
					z-index: 3;
					opacity: {indicatorVisible ? 1 : 0};
					transition: left 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
					            width 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
					            opacity 0.15s ease;
				"
        ></div>

        {#each navItems as item}
          {@const active = isActive(item.href)}
          <a
            href={item.href}
            data-active={active}
            class="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full"
            style="color: {active
              ? 'var(--app-fg)'
              : 'var(--app-muted)'}; transition: color 0.2s ease;"
          >
            {#if item.href === "/"}
              <svg
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            {:else if item.href === "/passport"}
              <svg
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <circle cx="9" cy="12" r="2" />
                <path d="M15 9h2M15 13h2M9 16h6" />
              </svg>
            {:else if item.href === "/wrapped"}
              <svg
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M12 3 14.5 9.5 21 10.5l-5 4.5 1.5 6.5L12 18l-5.5 3.5L8 15 3 10.5l6.5-1z"
                />
                <path d="M5 3v3M3 5h3M19 15v3M17 17h3" />
              </svg>
            {/if}
            <span class="text-[10px] leading-none font-medium"
              >{$t(item.labelKey)}</span
            >
          </a>
        {/each}
      </nav>

      <!-- Right: Theme toggle -->
      <div class="flex-1 flex justify-end">
        <button
          onclick={toggleTheme}
          class="glass-side-btn w-10 h-10 flex items-center justify-center rounded-full"
          style="
					background: var(--glass-bg);
					border: 1px solid var(--glass-border);
					box-shadow: var(--glass-shadow);
					backdrop-filter: blur(44px) saturate(220%);
					-webkit-backdrop-filter: blur(44px) saturate(220%);
					color: var(--app-muted);
				"
          title={$t("menu.home")}
        >
          {#if themeStore.current === "dark"}
            <svg
              class="w-[15px] h-[15px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
              />
            </svg>
          {:else}
            <svg
              class="w-[15px] h-[15px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Liquid crystal glass pill */
  .glass-pill {
    overflow: hidden;
    isolation: isolate;
    position: relative;
  }

  /* Specular highlight — bright line at the very top edge */
  .glass-pill::before {
    content: "";
    position: absolute;
    top: 0;
    left: 12%;
    right: 12%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.65) 25%,
      rgba(255, 255, 255, 0.65) 75%,
      transparent 100%
    );
    pointer-events: none;
    z-index: 2;
  }

  /* Inner gradient sheen — convex lens illusion */
  .glass-pill::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.12) 0%,
      rgba(255, 255, 255, 0.03) 45%,
      rgba(0, 0, 0, 0.04) 100%
    );
    pointer-events: none;
    z-index: 2;
  }

  /* Nav links sit above the decorative layers */
  .glass-pill > a {
    position: relative;
    z-index: 3;
  }

  /* View transition: disable default cross-fade, only use our ripple */
  :global(::view-transition-old(root)),
  :global(::view-transition-new(root)) {
    animation: none;
    mix-blend-mode: normal;
  }

  /* Side buttons hover */
  .glass-side-btn {
    transition: opacity 0.15s ease;
  }
  .glass-side-btn:hover {
    opacity: 0.75;
  }
</style>
