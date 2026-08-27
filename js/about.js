// About / presentation page behavior:
//  - reveal each slide as it scrolls into view
//  - sync the side progress rail with the slide currently in view
//  - smooth-scroll the rail dots to their section
//
// Purely decorative; every animation degrades to a static state under
// prefers-reduced-motion (handled in css/about.css).

export function initAbout() {
  const slides = Array.from(document.querySelectorAll(".slide"));
  const dots = Array.from(document.querySelectorAll(".about-rail a"));

  if (!slides.length) return;

  // Reveal-on-scroll
  if ("IntersectionObserver" in window) {
    const revealIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            revealIO.unobserve(e.target);
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );
    for (const s of slides) revealIO.observe(s);
  } else {
    for (const s of slides) s.classList.add("in");
  }

  // Progress rail: highlight the slide nearest the viewport center
  const setActive = (id) => {
    for (const d of dots) {
      const on = d.dataset.target === id;
      d.classList.toggle("is-active", on);
      if (on) d.setAttribute("aria-current", "true");
      else d.removeAttribute("aria-current");
    }
  };

  const visibleIO = new IntersectionObserver(
    (entries) => {
      let best = null;
      for (const e of entries) {
        if (e.isIntersecting && (!best || e.intersectionRatio > best.intersectionRatio)) {
          best = e;
        }
      }
      if (best) setActive(best.target.id);
    },
    { threshold: [0.25, 0.5, 0.75], rootMargin: "-10% 0px -10% 0px" }
  );
  for (const s of slides) visibleIO.observe(s);

  // Smooth-scroll the rail dots
  for (const d of dots) {
    d.addEventListener("click", (ev) => {
      const el = document.getElementById(d.dataset.target);
      if (!el) return;
      ev.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}
