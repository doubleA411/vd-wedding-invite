(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Background music ---- */
  const bgAudio = document.querySelector('[data-bg-audio]');
  const soundToggle = document.querySelector('[data-sound-toggle]');
  let startMusic = () => {};
  if (bgAudio && soundToggle){
    bgAudio.volume = 0.5;
    const setMuted = (muted) => {
      bgAudio.muted = muted;
      soundToggle.classList.toggle('is-muted', muted);
      soundToggle.setAttribute('aria-label', muted ? 'Play music' : 'Mute music');
      soundToggle.setAttribute('aria-pressed', String(!muted));
    };
    setMuted(false);
    soundToggle.hidden = false;
    soundToggle.addEventListener('click', () => {
      const next = !bgAudio.muted;
      setMuted(next);
      if (!next) bgAudio.play().catch(() => {});
    });

    startMusic = () => {
      const p = bgAudio.play();
      if (!p || !p.catch) return;
      // The clip is muted so it opens on its own, but no browser will autoplay
      // audible sound without a gesture. Rather than lose the music entirely,
      // arm the guest's first touch — usually the scroll a second or two later.
      p.catch(() => {
        const evts = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
        const go = () => {
          evts.forEach((e) => window.removeEventListener(e, go));
          bgAudio.play().catch(() => {});
        };
        evts.forEach((e) => window.addEventListener(e, go, { passive: true }));
      });
    };
  }

  /* ---- Hero: opens on load ---- */
  const hero = document.querySelector('[data-hero]');
  if (hero){
    const video = hero.querySelector('[data-hero-video]');
    let revealed = false;

    // Matches the longest .reveal-up delay — the scroll cue at 2.4s — plus its
    // .9s animation, so the whole chain finishes as the clip reaches its final
    // frame. Bump this if any delay in the hero markup moves.
    const REVEAL_LEAD_SECONDS = 3.3;

    const revealNames = () => {
      if (revealed) return;
      revealed = true;
      hero.classList.add('hero--open');
    };

    function openInvite(){
      startMusic();

      if (!video || reduceMotion){ revealNames(); return; }

      const finish = () => { try { video.pause(); } catch(e){} revealNames(); };

      const onTime = () => {
        const lead = video.duration ? video.duration - REVEAL_LEAD_SECONDS : 0;
        if (video.currentTime >= Math.max(0, lead)){
          video.removeEventListener('timeupdate', onTime);
          revealNames();
        }
      };
      video.addEventListener('timeupdate', onTime);
      video.addEventListener('ended', finish, { once: true });
      // A decode error, a blocked autoplay, or a slow connection — never strand
      // the guest staring at a still poster with no names on it.
      video.addEventListener('error', finish, { once: true });
      // Guarded on currentTime as well as the event, so a 'playing' that fires
      // before this handler attaches can't pause a clip that is running fine.
      const stall = setTimeout(() => { if (!revealed && !video.currentTime) finish(); }, 4500);
      video.addEventListener('playing', () => clearTimeout(stall), { once: true });

      const p = video.play();
      if (p && p.catch) p.catch(() => { clearTimeout(stall); finish(); });
    }

    openInvite();
  }

  /* ---- Hero tilt: gyroscope on phones, pointer on desktop ----
     Both feed a target that is eased each frame into --tx / --ty on :root.
     Only .hero__content reads them — the clip and the veil stay put. ---- */
  if (!reduceMotion){
    const root = document.documentElement;
    const heroEl = document.querySelector('[data-hero]');
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    let targetX = 0, targetY = 0, curX = 0, curY = 0, lastX = 0, lastY = 0;
    let running = false;

    const EASE = 0.16;       // single smoothing stage — the CSS never transitions
    const DEADZONE = 0.002;  // don't repaint for movement nobody can see

    function loop(){
      if (!running) return;
      curX += (targetX - curX) * EASE;
      curY += (targetY - curY) * EASE;
      if (Math.abs(curX - lastX) > DEADZONE || Math.abs(curY - lastY) > DEADZONE){
        lastX = curX; lastY = curY;
        root.style.setProperty('--tx', curX.toFixed(3));
        root.style.setProperty('--ty', curY.toFixed(3));
      }
      requestAnimationFrame(loop);
    }
    const run = () => { if (!running){ running = true; requestAnimationFrame(loop); } };
    run();

    // Nothing below the fold reads --tx/--ty, so drop the frame loop once the
    // hero scrolls away rather than easing toward a target nobody can see.
    if (heroEl && 'IntersectionObserver' in window){
      new IntersectionObserver((entries) => {
        entries.forEach((en) => { en.isIntersecting ? run() : (running = false); });
      }, { threshold: 0 }).observe(heroEl);
    }

    /* ---- pointer (desktop / anything with a cursor) ---- */
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;   // gyro owns touch devices
      targetX = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
      targetY = clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1);
    }, { passive: true });

    /* ---- gyroscope ----
       The first reading becomes "level", so this works however the phone is
       being held rather than assuming it is face-up. */
    let baseBeta = null, baseGamma = null;
    let fBeta = 0, fGamma = 0;   // low-pass filtered sensor values
    const RANGE = 26;            // degrees of tilt mapping to full deflection
    const SENSOR_EASE = 0.25;    // tames raw sensor noise before it is used
    const RECENTRE = 0.0005;     // gentle drift so a held angle doesn't stick

    function readOrient(e){
      if (e.beta === null || e.gamma === null) return;

      // Landscape swaps what beta and gamma mean; without this the axes invert.
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let beta = e.beta, gamma = e.gamma;
      if (angle === 90){ const t = beta; beta = -gamma; gamma = t; }
      else if (angle === -90 || angle === 270){ const t = beta; beta = gamma; gamma = -t; }
      else if (Math.abs(angle) === 180){ beta = -beta; gamma = -gamma; }

      if (baseBeta === null){
        baseBeta = beta; baseGamma = gamma;
        fBeta = beta; fGamma = gamma;
        return;
      }

      // Smooth the sensor itself — iOS reports a noisy signal.
      fBeta  += (beta  - fBeta)  * SENSOR_EASE;
      fGamma += (gamma - fGamma) * SENSOR_EASE;

      // Let the neutral point creep toward how the phone is actually being
      // held, so a guest reading at an angle doesn't sit pinned to one side.
      baseBeta  += (fBeta  - baseBeta)  * RECENTRE;
      baseGamma += (fGamma - baseGamma) * RECENTRE;

      targetX = clamp((fGamma - baseGamma) / RANGE, -1, 1);
      targetY = clamp((fBeta  - baseBeta)  / RANGE, -1, 1);
    }

    const startGyro = () => {
      window.addEventListener('deviceorientation', readOrient, { passive: true });
      // Some Android devices only populate the absolute variant.
      window.addEventListener('deviceorientationabsolute', readOrient, { passive: true });
    };

    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function'){
      // iOS 13+ grants only from inside a user gesture, and the tap-to-open
      // button that used to supply one is gone. Borrow the guest's first real
      // interaction instead. Note wheel and scroll do NOT count as activation,
      // so this deliberately listens for the pointer/key events that do.
      const acts = ['pointerdown', 'touchend', 'keydown'];
      const ask = () => {
        acts.forEach((ev) => window.removeEventListener(ev, ask));
        DOE.requestPermission()
          .then((state) => { if (state === 'granted') startGyro(); })
          .catch(() => {});
      };
      acts.forEach((ev) => window.addEventListener(ev, ask));
    } else {
      startGyro();
    }

    // Recentre if the phone is picked up at a different angle.
    window.addEventListener('orientationchange', () => { baseBeta = null; baseGamma = null; });
  }

  /* ---- Countdown ---- */
  const countdowns = document.querySelectorAll('[data-countdown]');
  const pad = (n) => String(n).padStart(2, '0');
  function tick(el){
    const target = new Date(el.dataset.countdown).getTime();
    const diff = Math.max(0, target - Date.now());
    el.querySelector('[data-days]').textContent = pad(Math.floor(diff / 86400000));
    el.querySelector('[data-hours]').textContent = pad(Math.floor((diff % 86400000) / 3600000));
    el.querySelector('[data-minutes]').textContent = pad(Math.floor((diff % 3600000) / 60000));
    el.querySelector('[data-seconds]').textContent = pad(Math.floor((diff % 60000) / 1000));
  }
  if (countdowns.length){
    countdowns.forEach(tick);
    setInterval(() => countdowns.forEach(tick), 1000);
  }

  /* ---- Scroll reveal ---- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length){
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting){ en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---- Scratch-to-reveal (heart) ---- */
  const scratchCard = document.querySelector('[data-scratch]');
  if (scratchCard){
    const canvas = scratchCard.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    let scratching = false, revealed = false, activePointerId = null, strokes = 0;

    function paintLayer(){
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // A resize mid-load could otherwise leave a spuriously "revealed" canvas
      // permanently invisible once redrawn.
      if (revealed && strokes < 8){
        revealed = false;
        canvas.style.transition = '';
        canvas.style.opacity = '';
        canvas.style.pointerEvents = '';
      }
      if (revealed) return;

      // Peacock foil: gold into marigold into deep teal. Canvas can't read CSS
      // custom properties, so these track the :root palette by hand — update
      // both if the palette changes again.
      // The canvas is clipped to a heart, so a corner-to-corner axis would put
      // the final stop outside the shape entirely. Aim it at the heart's bottom
      // point instead, so the gold-into-teal shift is actually visible.
      const grad = ctx.createLinearGradient(0, 0, w * .5, h);
      grad.addColorStop(0, '#f0b64a');
      grad.addColorStop(.45, '#e8a33d');
      grad.addColorStop(1, '#0e4f52');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(255,255,255,.14)';
      for (let i = 0; i < 60; i++){
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.6 + .4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '600 14px "Cormorant Garamond", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Scratch here', w / 2, h / 2 - 4);
    }

    const pointFrom = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    function scratchAt(x, y){
      strokes++;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();
    }

    function checkRevealed(){
      if (revealed || strokes < 8) return;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0, sampled = 0;
      for (let i = 3; i < data.length; i += 4 * 37){
        sampled++;
        if (data[i] === 0) clear++;
      }
      // The canvas is a rectangle clipped to a heart, so the corners sit
      // outside the clip and can never receive a pointer — roughly 30% of the
      // pixels are unscratchable. Threshold against the heart, not the box.
      if (sampled && clear / sampled > 0.35){
        revealed = true;
        canvas.style.transition = 'opacity .7s ease';
        canvas.style.opacity = '0';
        canvas.style.pointerEvents = 'none';
      }
    }

    canvas.addEventListener('pointerdown', (e) => {
      scratching = true;
      activePointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch(err){}
      const p = pointFrom(e);
      scratchAt(p.x, p.y);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!scratching || e.pointerId !== activePointerId) return;
      const p = pointFrom(e);
      scratchAt(p.x, p.y);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerId !== activePointerId) return;
      scratching = false;
      checkRevealed();
    });
    canvas.addEventListener('pointercancel', () => { scratching = false; checkRevealed(); });
    canvas.addEventListener('pointerleave', () => { if (scratching) checkRevealed(); });

    window.addEventListener('resize', paintLayer);
    paintLayer();
  }

  /* ---- Moments carousel ---- */
  const carousel = document.querySelector('[data-carousel]');
  if (carousel){
    const track = carousel.querySelector('[data-track]');
    const slides = Array.from(track.children);
    const dotsWrap = carousel.querySelector('[data-dots]');
    let index = 0, timer;

    slides.forEach((_, i) => {
      const dot = document.createElement('span');
      if (i === 0) dot.classList.add('is-active');
      dot.addEventListener('click', () => { goTo(i); startAutoplay(); });
      dotsWrap.appendChild(dot);
    });
    const dots = Array.from(dotsWrap.children);

    function goTo(i){
      slides[index].classList.remove('is-active');
      dots[index].classList.remove('is-active');
      index = (i + slides.length) % slides.length;
      slides[index].classList.add('is-active');
      dots[index].classList.add('is-active');
    }
    function startAutoplay(){
      clearInterval(timer);
      if (!reduceMotion) timer = setInterval(() => goTo(index + 1), 4200);
    }

    slides[0].classList.add('is-active');
    startAutoplay();

    let startX = 0;
    track.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    track.addEventListener('pointerup', (e) => {
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 40){ goTo(index + (dx < 0 ? 1 : -1)); startAutoplay(); }
    });
  }

  /* ---- Sticker marquee: duplicate for a seamless -50% loop ---- */
  const marquee = document.querySelector('[data-marquee]');
  if (marquee && !reduceMotion) marquee.innerHTML += marquee.innerHTML;

  /* ---- Save the date (.ics) ---- */
  const calBtn = document.querySelector('[data-add-calendar]');
  if (calBtn){
    calBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Vishal and Dharani//Wedding//EN',
        'BEGIN:VEVENT',
        'UID:vishal-dharani-wedding-2026@invite',
        'DTSTAMP:20260818T000000Z',
        'DTSTART:20260830T020000Z',
        'DTEND:20260830T033000Z',
        'SUMMARY:Vishal & Dharani\'s Wedding',
        'DESCRIPTION:Reception Sat 29 Aug 7:00 PM. Wedding Sun 30 Aug 7:30-9:00 AM at Sree Varaaham A/C Mahal.',
        'LOCATION:Sree Varaaham A/C Mahal\\, 231 Jawaharlal Nehru Salai\\, Koyambedu\\, Chennai\\, TN 600107',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vishal-dharani-wedding.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }

})();
