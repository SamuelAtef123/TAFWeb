// import { useState, useEffect } from 'react';
// import axios from 'axios';
// import { Link } from 'react-router-dom';

// function Home() {
//   const [products, setProducts] = useState([]);
//   const [category, setCategory] = useState('All');
//   const [error, setError] = useState('');
//   const [cartCount, setCartCount] = useState(0);

//   const refreshCartCount = () => {
//     const cart = JSON.parse(localStorage.getItem('cart') || '[]');
//     setCartCount(cart.reduce((sum, item) => sum + item.quantity, 0));
//   };

//   useEffect(() => {
//     const fetchProducts = async () => {
//       try {
//         const { data } = await axios.get('/api/products');
//         setProducts(data);
//       } catch (err) {
//         setError(err.response?.data?.message || 'Unable to load products.');
//       }
//     };

//     fetchProducts();
//     refreshCartCount();
//   }, []);

//   const filteredProducts =
//     category === 'All' ? products : products.filter(p => p.category === category);

//   const addToCart = product => {
//     const cart = JSON.parse(localStorage.getItem('cart') || '[]');
//     const existingItem = cart.find(item => item._id === product._id);

//     if (existingItem) {
//       existingItem.quantity += 1;
//     } else {
//       cart.push({ ...product, quantity: 1 });
//     }

//     localStorage.setItem('cart', JSON.stringify(cart));
//     refreshCartCount();
//   };

//   return (
//     <div className="storefront">
//       <header className="site-header">
//         <Link className="brand" to="/">
//           <span className="brand-mark">T&amp;F</span>
//           <span>
//             Tino &amp; Friends <strong>Bakery</strong>
//           </span>
//         </Link>

//         <nav className="site-nav" aria-label="Main navigation">
//           <a href="#menu">Menu</a>
//           <a href="#story">Our story</a>
//           <Link className="cart-link" to="/cart">
//             Cart <span>{cartCount}</span>
//           </Link>
//         </nav>
//       </header>

//       <main>
//         <section className="hero" id="story">
//           <div className="hero-copy">
//             <p className="eyebrow">Baked fresh in small batches</p>
//             <h1>
//               A little joy,
//               <br />
//               <em>fresh from the oven.</em>
//             </h1>
//             <p className="hero-text">
//               Hand-shaped bread, buttery pastries, and good things to share with your
//               favorite people.
//             </p>
//             <a className="primary-button" href="#menu">
//               Explore the menu <span>↓</span>
//             </a>
//           </div>

//           <div className="hero-art" aria-label="Tino & Friends bakery mascot" role="img">
//             <img
//               className="hero-logo"
//               src="/Logo3.png"
//               alt="Tino & Friends Bakery mascot"
//             />
//           </div>
//         </section>

//         <section className="menu-section" id="menu">
//           <div className="section-heading">
//             <div>
//               <p className="eyebrow">Today at the bakery</p>
//               <h2>Find your favorite.</h2>
//             </div>
//             <p className="section-note">From our oven to your table.</p>
//           </div>

//           <div className="category-list" aria-label="Product categories">
//             {['All', 'Bread', 'Beverage', 'Pastries', 'Sandwich', 'Viennoiserie'].map(
//               item => (
//                 <button
//                   className={category === item ? 'category active' : 'category'}
//                   type="button"
//                   key={item}
//                   onClick={() => setCategory(item)}
//                 >
//                   {item}
//                 </button>
//               )
//             )}
//           </div>

//           {error && (
//             <p className="error-message" role="alert">
//               {error}
//             </p>
//           )}

//           {filteredProducts.length === 0 && !error ? (
//             <div className="empty-menu">
//               <span>✦</span>
//               <h3>The oven is warming up.</h3>
//               <p>
//                 Our menu is being prepared. Check back soon for something delicious.
//               </p>
//             </div>
//           ) : (
//             <div className="product-grid">
//               {filteredProducts.map(product => (
//                 <article className="product-card" key={product._id}>
//                   <Link to={`/product/${product._id}`} className="product-image">
//                     {product.image ? (
//                       <img src={product.image} alt={product.name} />
//                     ) : (
//                       <span>✦</span>
//                     )}
//                   </Link>

//                   <div className="product-info">
//                     <p className="product-category">{product.category}</p>
//                     <h3>{product.name}</h3>
//                     <p className="product-price">
//                       ${Number(product.price).toFixed(2)}
//                     </p>
//                   </div>

//                   <button
//                     className="add-button"
//                     type="button"
//                     onClick={() => addToCart(product)}
//                     aria-label={`Add ${product.name} to cart`}
//                   >
//                     +
//                   </button>
//                 </article>
//               ))}
//             </div>
//           )}
//         </section>
//       </main>

//       <footer>
//         <span>Tino &amp; Friends Bakery</span>
//         <span>Made for slow mornings and shared tables.</span>
//       </footer>
//     </div>
//   );
// }

// export default Home;

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import BasketMenu from './BasketMenu/BasketMenu';
import './Home.css';

const MARQUEE = ['Croissants', 'Sourdough', 'Pain au chocolat', 'Brioche', 'Baguette', 'Café crème', 'Éclairs', 'Canelés'];
const HEADLINE = ['Baked', 'at', 'dawn,', 'still', 'warm', 'when', 'you', 'arrive.'];
// const FLOUR = Array.from({ length: 28 }, (_, i) => ({
//   left: (i * 37) % 100,
//   size: 2 + (i % 4),
//   delay: (i * 0.7) % 9,
//   dur: 9 + (i % 6) * 2,
// }));

function Home() {
  const [cartCount, setCartCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef(null);

  const refreshCartCount = () => {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    setCartCount(cart.reduce((sum, item) => sum + item.quantity, 0));
  };

  useEffect(() => {
    refreshCartCount();
    // the basket section announces every change so this header counter stays in sync
    window.addEventListener('cart:updated', refreshCartCount);
    return () => window.removeEventListener('cart:updated', refreshCartCount);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll('.bk [data-reveal]:not(.in)');
    const io = new IntersectionObserver(
      entries =>
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const onMove = e => {
    const r = heroRef.current.getBoundingClientRect();
    heroRef.current.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    heroRef.current.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };

  return (
    <div className="bk">
      <header className={scrolled ? 'bk-header solid' : 'bk-header'}>
        <Link className="bk-brand" to="/">
          <span className="bk-mark">T&amp;F</span>
          <span>Tino &amp; Friends <em>Bakery</em></span>
        </Link>
        <nav className="bk-nav" aria-label="Main navigation">
          <a href="#menu">Menu</a>
          <a href="#story">Our story</a>
          <Link className="bk-cart" to="/cart">
            Cart <span key={cartCount}>{cartCount}</span>
          </Link>
        </nav>
      </header>

      <main>
        <section className="bk-hero" id="story" ref={heroRef} onMouseMove={onMove}>
          <div className="bk-glow" aria-hidden="true" />
          <div className="bk-flour" aria-hidden="true">
            {/* {FLOUR.map((f, i) => (
              <i key={i} style={{ left: `${f.left}%`, width: f.size, height: f.size, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s` }} />
            ))} */}
          </div>

          <video className="bk-video" autoPlay muted loop playsInline aria-hidden="true">
            <source src="/backgroundloop.mp4" type="video/mp4" />
          </video>

          <div className="bk-hero-stage">
            {/* <div className="bk-steam" aria-hidden="true">
              {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ '--i': i }} />)}
            </div>
            <div className="bk-arch" aria-hidden="true" /> */}

            <div className="bk-hero-logo-wrap" aria-label="Tino & Friends bakery mascot" role="img">
              <img
                className="bk-hero-logo"
                src="/Logo3.png"
                alt="Tino & Friends Bakery mascot"
              />
            </div>
          </div>

          <div className="bk-hero-copy">
            <p className="bk-kicker">Fresh from the oven, every morning</p>
            <h1 aria-label={HEADLINE.join(' ')}>
              {HEADLINE.map((w, i) => (
                <span className="bk-word" key={i} aria-hidden="true">
                  <span style={{ animationDelay: `${0.9 + i * 0.09}s` }}>{w}&nbsp;</span>
                </span>
              ))}
            </h1>
            <p className="bk-lede">
              Hand-laminated croissants, slow-fermented bread and good things to share.
              Come in while the butter is still singing.
            </p>
            <a className="bk-cta" href="#menu">See today&apos;s bake</a>
          </div>
          <div className="bk-scroll" aria-hidden="true" />
        </section>

        <div className="bk-marquee" aria-hidden="true">
          <div className="bk-track">
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={i}>{m}<b>✦</b></span>
            ))}
          </div>
        </div>

        <BasketMenu />
      </main>

      <footer className="bk-footer">
        <span>Tino &amp; Friends Bakery</span>
        <span>Made for slow mornings and shared tables.</span>
        <span>Photos via <a href="https://pixabay.com" target="_blank" rel="noreferrer">Pixabay</a></span>
      </footer>
    </div>
  );
}

export default Home;