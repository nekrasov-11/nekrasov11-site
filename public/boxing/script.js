(function () {
    const root = document.documentElement;
    let ticking = false;

    function update() {
        root.style.setProperty("--scroll", window.scrollY);
        ticking = false;
    }

    window.addEventListener("scroll", function () {
        if (!ticking) {
            window.requestAnimationFrame(update);
            ticking = true;
        }
    }, { passive: true });

    update();
})();
