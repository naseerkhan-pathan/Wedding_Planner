// Chatbot behavior: presents predefined question sets and cycles until Exit
(function(){
  const questionSets = [
    [
      {q: 'What services do you offer?', a: 'We provide photography, catering, venue booking, makeup, cakes, music and more. Use the menu to explore each service.'},
      {q: 'How can I book a vendor?', a: 'Click "Book Now" or register on the site, then choose your preferred Services from Our service page.'},
      {q: 'What are the payment options?', a: 'Payments can be handled online or in-person but advance pay online only. Contact us for exact details.'}
    ],
    [
      {q: 'Do you provide venue decoration?', a: 'Yes — we coordinate with decorators. Tell us your theme and budget when booking to our contact details either whatsapp or mail'},
      {q: 'Can I customize my menu?', a: 'Absolutely. Catering packages are customizable — contact us for menu options.'},
      {q: 'Are reviews available?', a: 'Yes. reviews and ratings on their profile to help our customers make informed decisions.'}
    ],
    [
      {q: 'How soon should I book Services?', a: 'We recommend booking services (venue, photographer, caterer) 1–3 months in advance for best availability. if need immediatly contact us.'},
      {q: 'Do you offer trial sessions for makeup?', a: 'yes, we offer makeup trial sessions with low price not totally free. contact us to schedule a trial.'},
      {q: 'Can I change my booking later?', a: 'Based on Booking policies you can change the wedding to anothe date but if we available then we take it otherwise advance not refundable if we are not available at that time. Important point is if you cancel your booking we cannot refund back your advance.'}
    ]
  ];

  let currentSet = 0;

  const chatToggle = document.getElementById('chatToggle');
  const chatWindow = document.getElementById('chatWindow');
  const chatClose = document.getElementById('chatClose');
  const chatChoices = document.getElementById('chatChoices');
  const chatMessages = document.getElementById('chatMessages');

  function openChat(){
    chatWindow.classList.remove('hidden');
    chatWindow.setAttribute('aria-hidden','false');
    renderChoices();
  }

  function closeChat(){
    chatWindow.classList.add('hidden');
    chatWindow.setAttribute('aria-hidden','true');
    resetChat();
  }

  function resetChat(){
    currentSet = 0;
    chatMessages.innerHTML = '';
    renderChoices();
  }

  function renderChoices(){
    chatChoices.innerHTML = '';
    const set = questionSets[currentSet] || questionSets[0];
    set.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = item.q;
      btn.onclick = () => handleChoice(item);
      chatChoices.appendChild(btn);
    });
    const exit = document.createElement('button');
    exit.className = 'choice-btn choice-exit';
    exit.textContent = 'Exit';
    exit.onclick = () => handleExit();
    chatChoices.appendChild(exit);
  }

  function appendMessage(who, text){
    const div = document.createElement('div');
    div.className = 'msg ' + (who === 'user' ? 'user' : 'bot');
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function handleChoice(item){
    appendMessage('user', item.q);
    // small typing delay
    setTimeout(() => {
      appendMessage('bot', item.a);
      // advance to next set
      currentSet = (currentSet + 1) % questionSets.length;
      // re-render choices so next set appears
      setTimeout(renderChoices, 300);
    }, 400);
  }

  function handleExit(){
    appendMessage('user','Exit');
    setTimeout(() => {
      appendMessage('bot','Thanks for visiting — feel free to open this chat again anytime.');
      setTimeout(closeChat, 800);
    }, 300);
  }

  chatToggle && chatToggle.addEventListener('click', () => {
    if (chatWindow.classList.contains('hidden')) openChat(); else closeChat();
  });
  chatClose && chatClose.addEventListener('click', closeChat);

  // keyboard accessibility: close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!chatWindow.classList.contains('hidden')) closeChat();
      const reviewModal = document.getElementById('reviewModal');
      if (reviewModal && reviewModal.style.display === 'block') {
        reviewModal.style.display = 'none';
      }
    }
  });

  function animateStats() {
    const counters = document.querySelectorAll('.stat-value');
    if (!counters.length) return;
    counters.forEach((counter) => {
      const target = +counter.getAttribute('data-target');
      const step = Math.max(1, Math.ceil(target / 90));
      let current = 0;
      const update = () => {
        current += step;
        if (current >= target) {
          counter.textContent = target + '+';
        } else {
          counter.textContent = current + '+';
          requestAnimationFrame(update);
        }
      };
      requestAnimationFrame(update);
    });
  }

  function resetStats() {
    const counters = document.querySelectorAll('.stat-value');
    counters.forEach((counter) => {
      counter.textContent = '0';
    });
  }

  function startStatsObserver() {
    const statsSection = document.querySelector('.stats-section');
    if (!statsSection) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateStats();
        } else {
          resetStats();
        }
      });
    }, { threshold: 0.4 });
    observer.observe(statsSection);
  }

  const reviewModal = document.getElementById('reviewModal');
  const reviewOpenBtn = document.getElementById('viewReviewsBtn');
  const reviewCloseBtn = document.getElementById('reviewModalClose');

  function openReviewModal() {
    if (reviewModal) {
      reviewModal.style.display = 'block';
    }
  }

  function closeReviewModal() {
    if (reviewModal) {
      reviewModal.style.display = 'none';
    }
  }

  reviewOpenBtn && reviewOpenBtn.addEventListener('click', openReviewModal);
  reviewCloseBtn && reviewCloseBtn.addEventListener('click', closeReviewModal);
  window.addEventListener('click', (event) => {
    if (event.target === reviewModal) {
      closeReviewModal();
    }
  });

  function setupBookingModal() {
    const bookingModal = document.getElementById('bookingModal');
    const bookingCloseBtn = document.getElementById('bookingModalClose');
    const serviceButtons = document.querySelectorAll('.service-card .book-btn');

    function openBookingModal(serviceName, serviceId) {
      if (bookingModal) {
        document.getElementById('selectedService').textContent = serviceName;
        document.getElementById('serviceId').value = serviceId;
        document.getElementById('serviceName').value = serviceName;
        bookingModal.style.display = 'block';
      }
    }

    function closeBookingModal() {
      if (bookingModal) {
        bookingModal.style.display = 'none';
      }
    }

    serviceButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const card = this.closest('.service-card');
        const serviceName = card.querySelector('.service-title').textContent;
        const serviceId = this.getAttribute('data-service-id');
        openBookingModal(serviceName, serviceId);
      });
    });

    bookingCloseBtn && bookingCloseBtn.addEventListener('click', closeBookingModal);
    window.addEventListener('click', (event) => {
      if (event.target === bookingModal) {
        closeBookingModal();
      }
    });

    // Handle booking form submission
    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) {
      bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(bookingForm);
        const data = {
          serviceId: formData.get('serviceId'),
          serviceName: formData.get('serviceName'),
          eventDate: formData.get('eventDate'),
          notes: formData.get('notes'),
        };

        try {
          const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });

          const result = await response.json();
          if (result.success) {
            alert('Booking created successfully!');
            closeBookingModal();
            bookingForm.reset();
          } else {
            alert('Failed to create booking: ' + result.message);
          }
        } catch (error) {
          console.error('Booking error:', error);
          alert('Error creating booking');
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    startStatsObserver();
    setupBookingModal();
  });
})();
