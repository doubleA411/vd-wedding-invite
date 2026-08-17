(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Background music ----
  const bgAudio = document.querySelector('[data-bg-audio]');
  const soundToggle = document.querySelector('[data-sound-toggle]');
  if (bgAudio && soundToggle){
    bgAudio.volume = 0.5;
    const setMuted = (muted) => {
      bgAudio.muted = muted;
      soundToggle.classList.toggle('is-muted', muted);
      soundToggle.setAttribute('aria-label', muted ? 'Play music' : 'Mute music');
      soundToggle.setAttribute('aria-pressed', String(!muted));
    };
    setMuted(false);
    soundToggle.addEventListener('click', () => setMuted(!bgAudio.muted));
  }

  // ---- "Start the Show": light the marquee, roll the music ----
  const hero = document.querySelector('[data-hero]');
  const startBtn = document.querySelector('[data-start]');
  const cue = document.querySelector('[data-cue]');
  if (hero && startBtn){
    startBtn.addEventListener('click', () => {
      hero.classList.add('is-lit');
      startBtn.classList.add('is-done');
      if (cue) cue.classList.add('is-in');
      if (bgAudio){
        bgAudio.play().catch(() => {});
        soundToggle.hidden = false;
      }
      const tickets = document.getElementById('tickets');
      if (tickets){
        setTimeout(() => {
          tickets.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }, 1200);
      }
    });
  }

  // ---- Countdown ----
  const clocks = document.querySelectorAll('[data-countdown]');
  const pad = (n) => String(n).padStart(2, '0');
  function tick(el){
    const target = new Date(el.dataset.countdown).getTime();
    const diff = Math.max(0, target - Date.now());
    el.querySelector('[data-days]').textContent = pad(Math.floor(diff / 86400000));
    el.querySelector('[data-hours]').textContent = pad(Math.floor((diff % 86400000) / 3600000));
    el.querySelector('[data-minutes]').textContent = pad(Math.floor((diff % 3600000) / 60000));
    el.querySelector('[data-seconds]').textContent = pad(Math.floor((diff % 60000) / 1000));
  }
  if (clocks.length){
    clocks.forEach(tick);
    setInterval(() => clocks.forEach(tick), 1000);
  }

  // ---- Ticket: drag the stub across the perforation to tear ----
  const ticket = document.querySelector('[data-ticket]');
  if (ticket){
    const stub = ticket.querySelector('[data-stub]');
    const hint = document.querySelector('[data-ticket-hint]');
    const THRESHOLD = 62; // px of travel that counts as a tear
    let dragging = false;
    let startX = 0;
    let dx = 0;
    let torn = false;

    function tear(){
      if (torn) return;
      torn = true;
      stub.style.transform = '';
      stub.classList.remove('is-dragging');
      ticket.classList.add('ticket--torn');
      if (hint){
        hint.textContent = 'Admitted. See you there.';
        hint.classList.add('is-done');
      }
    }

    function springBack(){
      stub.classList.remove('is-dragging');
      stub.style.transform = '';
    }

    function onDown(e){
      if (torn) return;
      dragging = true;
      dx = 0;
      startX = e.clientX;
      stub.classList.add('is-dragging');
      stub.setPointerCapture(e.pointerId);
    }
    function onMove(e){
      if (!dragging || torn) return;
      dx = e.clientX - startX;
      if (dx < 0) dx = 0;                    // only tears outward
      const rot = Math.min(12, dx * 0.14);
      stub.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
      if (dx > THRESHOLD){ dragging = false; tear(); }
    }
    function onUp(){
      if (!dragging || torn) return;
      dragging = false;
      springBack();
    }

    stub.addEventListener('pointerdown', onDown);
    stub.addEventListener('pointermove', onMove);
    stub.addEventListener('pointerup', onUp);
    stub.addEventListener('pointercancel', onUp);

    // Keyboard fallback — Enter/Space/→ tears it outright
    stub.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight'){
        e.preventDefault();
        tear();
      }
    });

    // A plain tap shouldn't tear — that would skip the whole gesture. Nudge
    // the stub to teach the drag, and only give in on a second tap so a
    // guest who won't drag is never stuck.
    let taps = 0;
    stub.addEventListener('click', () => {
      if (torn || dx !== 0) return;
      taps++;
      if (taps >= 2){ tear(); return; }
      stub.classList.remove('is-nudging');
      void stub.offsetWidth;               // restart the animation
      stub.classList.add('is-nudging');
      if (hint) hint.textContent = 'Almost — drag it to the right →';
    });

    if (reduceMotion) tear();
  }

  // ---- Filmstrip: duplicate frames so the -50% loop is seamless ----
  const strip = document.querySelector('[data-strip]');
  if (strip && !reduceMotion){
    strip.innerHTML += strip.innerHTML;
  }

  // ---- Scroll reveals ----
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length){
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting){
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  // ---- End credits roll ----
  const creditsRoll = document.querySelector('[data-credits-roll]');
  if (creditsRoll && 'IntersectionObserver' in window){
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting){
          creditsRoll.classList.add('is-rolling');
          cio.disconnect();
        }
      });
    }, { threshold: 0.12 });
    cio.observe(creditsRoll);
  } else if (creditsRoll){
    creditsRoll.classList.add('is-rolling');
  }

  // ---- Add to calendar ----
  const calBtn = document.querySelector('[data-add-calendar]');
  if (calBtn){
    calBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Vishal and Dharani//Wedding//EN',
        'BEGIN:VEVENT',
        'UID:vishal-dharani-wedding-2026@now.showing',
        'DTSTAMP:20260817T000000Z',
        'DTSTART:20260830T020000Z',
        'DTEND:20260830T033000Z',
        'SUMMARY:Vishal & Dharani\'s Wedding',
        'DESCRIPTION:Reception Sat 29 Aug 7 PM. Wedding Sun 30 Aug 7:30-9:00 AM at Sree Varaaham A/C Mahal.',
        'LOCATION:Sree Varaaham A/C Mahal\\, 231 Jawaharlal Nehru Salai\\, Koyambedu\\, Chennai\\, TN 600107',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');
      const blob = new Blob([ics], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
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
