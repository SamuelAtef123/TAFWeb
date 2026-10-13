// Everything Tino says lives here, so it is easy to edit (or translate) in one place.

export const pick = list => list[Math.floor(Math.random() * list.length)];

// Quick-reply buttons. `id` is handled in Mascot.js (see `act`).
export const R = {
  menu: { id: 'menu', label: 'Show me the menu' },
  surprise: { id: 'surprise', label: 'Surprise me 🎲' },
  how: { id: 'how', label: 'How do I order?' },
  who: { id: 'who', label: 'Who are you?' },
  checkout: { id: 'checkout', label: 'Checkout →' },
  top: { id: 'top', label: 'Back to top ↑' },
  ok: { id: 'ok', label: 'Got it 👍' },
  bye: { id: 'bye', label: 'Bye, Tino 👋' },
};

export const LINES = {
  hello: {
    text: "Hi, I'm Tino! 👋 Welcome to Tino & Friends. Everything here is baked fresh every morning. Hungry?",
    replies: [R.menu, R.surprise, R.how, R.who],
  },
  helloDock: {
    text: "Psst, down here! 👋 I'm Tino. Want a hand picking something?",
    replies: [R.surprise, R.how, R.who],
  },
  welcomeBack: {
    text: 'Welcome back! 😄 Your basket missed you.',
    replies: [R.menu, R.checkout],
  },
  menu: {
    text: 'This is the good part! Drag any treat onto the basket, or just tap the + button.',
    replies: [R.surprise, R.how],
  },
  menuMobile: {
    text: 'This is the good part! Press and hold a treat, then drag it up to the basket. Or just tap +.',
    replies: [R.surprise, R.how],
  },
  footer: {
    text: 'Thanks for stopping by! Your basket will wait for you right here.',
    replies: [R.top, R.checkout],
  },
  how: {
    text: 'Easy! 1) Drag a treat onto the basket (or tap +). 2) Press Checkout. 3) Sign in and place your order, then pay and pick it up at the bakery.',
    replies: [R.menu, R.ok],
  },
  who: {
    text: "I'm Tino, the little baker from the logo! I carry the bread around here and help people find their favourites.",
    replies: [R.menu, R.surprise],
  },
  ok: { text: 'Great! Shout if you need me. 🙂', replies: [] },
  surprise: { text: 'Hmm… let me pick something for you… ta-da! 🎉', replies: [R.checkout] },
  checkoutEmpty: {
    text: 'Your basket is still empty! Drag something in first. 🙂',
    replies: [R.menu, R.surprise],
  },
  bye: { text: 'See you soon! Tap me down here if you need me. 👋', replies: [] },
  back: { text: "I'm back! 😄 What can I do for you?", replies: [R.menu, R.surprise, R.how] },
  poke: [
    { text: 'Hey, that tickles! 😆 Need a hand?', replies: [R.menu, R.surprise, R.how] },
    { text: "I'm all ears! Well… mostly hat. 👨‍🍳", replies: [R.menu, R.surprise, R.who] },
    { text: 'Can I help you find something tasty?', replies: [R.menu, R.surprise, R.how] },
  ],
  nudge: { text: "Can't decide? I can pick something for you!", replies: [R.surprise] },
  emptied: { text: 'A fresh start! Want me to pick something?', replies: [R.surprise] },
  removed: ['Changed your mind? No problem.', 'Back on the shelf it goes!'],
  feast: n => `${n} treats already — that's a proper feast! 🧺`,
  added: name =>
    pick([
      `${name}? Excellent choice!`,
      `Ooh, ${name} — one of my favourites!`,
      'Into the basket it goes! 🧺',
      `Mmm… ${name}. Smells great already.`,
    ]),
  cta: 'Follow me — the good stuff is down here! 🥐',
  surpriseClick: 'Ooh, a surprise! I love surprises. 🎁',
};

// Said when someone taps a category chip in the menu.
export const CATEGORY_LINES = {
  All: 'Everything! Take your time. 😊',
  Viennoiserie: 'Viennoiserie — flaky, buttery layers. My favourite!',
  Cookies: "Cookies! I'll pretend I didn't see that. 🍪",
  Muffins: 'Muffins — soft, fluffy and perfect with coffee.',
  'English Cake': 'A slice of English cake? Very proper.',
  Individuals: 'The little desserts! Almost too pretty to eat.',
  Bread: "Bread! That's what I'm carrying, you know. 🥖",
  Salad: 'Something fresh and green — nice balance!',
  Sandwiches: 'Sandwiches on our own bread. Lunch, sorted.',
  Tarts: 'Tarts — crisp pastry, silky filling. Yes please.',
  Choux: 'Éclairs and choux… light as air!',
  'Hot Drinks': 'Something warm? Great with a croissant. ☕',
  'V60 Coffee': 'Pour-over coffee — for the slow mornings.',
  'Cold Drinks': 'Something cool to sip on. 🧊',
  Smoothies: 'Smoothies! Fruity and fresh.',
  Beverages: 'A drink to go with your treats.',
  Extras: 'A little extra never hurts.',
  'New Drinks': 'Ooh, the new drinks! Have you tried them yet?',
};
