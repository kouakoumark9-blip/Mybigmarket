"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, ShoppingBag, ShoppingCart, UserRound, Menu, X, MessageCircle, MapPin, UserRoundPlus, Home, Grid2X2, ClipboardList, Heart, Globe, Check, Camera, BadgeCheck, Truck } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { useFavorites } from "@/components/favorites-provider";
import { useCountryPreferences } from "@/components/country-preferences";
import { countryName, destinationCountries } from "@/lib/west-africa";
import { headerNav, pdpConfig } from "@/lib/pdp/config";
import { ImageSearchDialog } from "@/components/image-search-dialog";
import { CountryFlag } from "@/components/country-flag";
import { LocateButton } from "@/components/locate-button";

const navIcons = { menu: Menu, badge: BadgeCheck, truck: Truck } as const;

export function SiteHeader() {
  const { count } = useCart();
  const { count: favoritesCount } = useFavorites();
  const { country, countryLabel, selectCountry, language, languageName, currency, exchangeRateReady, text } = useCountryPreferences();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showScrollSearch, setShowScrollSearch] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [imageSearchOpen, setImageSearchOpen] = useState(false);

  useEffect(() => {
    const updateSearchVisibility = () => setShowScrollSearch(window.scrollY > 140);
    updateSearchVisibility();
    window.addEventListener("scroll", updateSearchVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateSearchVisibility);
  }, []);

  useEffect(() => {
    if (!countryPickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCountryPickerOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [countryPickerOpen]);

  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLocaleLowerCase(language);
    if (!query) return destinationCountries;
    return destinationCountries.filter((item) => [countryName(item.code, language), countryName(item.code, "fr"), item.code, item.currency, item.languageName].some((value) => value.toLocaleLowerCase(language).includes(query)));
  }, [countrySearch, language]);

  const chooseCountry = (code: string) => {
    selectCountry(code);
    setCountryPickerOpen(false);
    setCountrySearch("");
  };

  return <>
    <div className="top-strip"><div className="shell top-strip-inner"><span>{text("topStrip")}</span>{country.currency !== "XOF" && !exchangeRateReady && <span className="exchange-unavailable">{text("exchangeUnavailable")}</span>}</div></div>
    <header className="site-header">
      <div className={`shell header-main ${showScrollSearch ? "is-scrolled" : ""}`}>
        <button className="mobile-menu-button" aria-label={mobileOpen ? text("closeMenu") : text("openMenu")} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X/> : <Menu/>}</button>
        <Link className="brand" href="/" aria-label="Mybigmarket"><span className="brand-wordmark"><span className="brand-initial">M</span>ybigmarket<small>CHINE → AFRIQUE DE L’OUEST</small></span></Link>
        <form action="/produits" className="search-form header-scroll-search" role="search" aria-label={text("searchCatalog")}>
          <Search size={18}/><input name="q" placeholder={text("searchCatalog")} aria-label={text("searchCatalog")}/><button type="button" className="search-image-button" onClick={() => setImageSearchOpen(true)} aria-label={pdpConfig.imageSearch} title={pdpConfig.imageSearch}><Camera size={19} strokeWidth={1.5}/></button><button type="submit" aria-label={text("search")}><span>{text("search")}</span><Search className="mobile-search-submit-icon" size={17}/></button>
        </form>
        <div className="header-actions">
          <button className="header-locale" type="button" aria-haspopup="dialog" aria-expanded={countryPickerOpen} onClick={() => setCountryPickerOpen(true)}>
            <span><b>{text("deliveryAddress")}</b><span className="header-locale-country"><CountryFlag code={country.code} size={24} className="header-flag"/><small>{countryLabel}</small></span></span>
          </button>
          <span className="header-currency" aria-label={`${languageName} · ${currency}`}><Globe size={17}/><span>{languageName} · {currency}</span></span>
          <Link href="/panier" className="header-action cart-action" aria-label={`${text("cart")}${count ? `, ${count}` : ""}`}><span className="cart-icon"><ShoppingCart size={22}/>{count > 0 && <b>{count}</b>}</span></Link>
          <Link href="/connexion" className="header-action" aria-label={text("signIn")}><UserRound size={19}/><span>{text("signIn")}</span></Link>
          <Link href="/inscription" className="header-signup"><UserRoundPlus size={15}/><span>{text("createAccount")}</span></Link>
        </div>
      </div>
      <nav className={`main-nav ${mobileOpen ? "is-open" : ""}`} aria-label={text("catalog")}>
        <div className="shell main-nav-inner">
          <div className="main-nav-primary">
            {headerNav.primary.map((item, index) => { const Icon = navIcons[item.icon]; return <Link key={item.href + item.label} className={index === 0 ? `nav-categories ${pathname.startsWith("/produits") ? "active" : ""}` : ""} href={item.href} onClick={() => setMobileOpen(false)}><Icon size={16} strokeWidth={1.5}/> {index === 0 ? text("allCategories") : item.label}</Link>; })}
          </div>
          <div className="main-nav-secondary">
            {headerNav.secondary.map((item) => <Link key={item.href + item.label} href={item.href} onClick={() => setMobileOpen(false)}>{item.label}</Link>)}
            <Link href="/messages" onClick={() => setMobileOpen(false)}><MessageCircle size={15}/> {text("messages")}</Link>
            <Link href="/favoris" className={pathname.startsWith("/favoris") ? "active" : ""} onClick={() => setMobileOpen(false)}><Heart size={15}/> {text("favorites")}{favoritesCount > 0 && <span className="favorite-nav-count">{favoritesCount}</span>}</Link>
            <Link className="nav-seller-mobile" href="/inscription" onClick={() => setMobileOpen(false)}><UserRoundPlus size={15}/> {text("createAccount")}</Link>
          </div>
        </div>
      </nav>
      <div className="mobile-contact"><MapPin size={14}/> {text("mobileContact")} <span>·</span> {currency}<button type="button" className="mobile-destination-button" onClick={() => setCountryPickerOpen(true)}><CountryFlag code={country.code} size={18}/>{countryLabel}</button></div>
    </header>
    <nav className="mobile-tabbar" aria-label={text("catalog")}>
      <Link href="/" className={pathname === "/" ? "active" : ""} aria-current={pathname === "/" ? "page" : undefined}><Home size={20}/><span>{text("home")}</span></Link>
      <Link href="/produits" className={pathname.startsWith("/produits") ? "active" : ""} aria-current={pathname.startsWith("/produits") ? "page" : undefined}><Grid2X2 size={20}/><span>{text("categories")}</span></Link>
      <Link href="/messages" className={pathname.startsWith("/messages") ? "active" : ""} aria-current={pathname.startsWith("/messages") ? "page" : undefined}><MessageCircle size={20}/><span>{text("messages")}</span></Link>
      <Link href="/panier" className={pathname === "/panier" || pathname === "/checkout" ? "active" : ""} aria-current={pathname === "/panier" ? "page" : undefined}><span className="mobile-tabbar-icon"><ShoppingBag size={20}/>{count > 0 && <b>{count}</b>}</span><span>{text("cart")}</span></Link>
      <Link href="/compte/commandes" className={pathname.startsWith("/compte/commandes") ? "active" : ""} aria-current={pathname.startsWith("/compte/commandes") ? "page" : undefined}><ClipboardList size={20}/><span>{text("orders")}</span></Link>
    </nav>
    <ImageSearchDialog open={imageSearchOpen} onClose={() => setImageSearchOpen(false)}/>
    {countryPickerOpen && <div className="country-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCountryPickerOpen(false); }}>
      <section className="country-picker-modal" role="dialog" aria-modal="true" aria-labelledby="country-picker-title" dir={language === "ar" ? "rtl" : "ltr"}>
        <div className="country-picker-heading"><div><span className="country-picker-eyebrow"><Globe size={14}/> {text("deliveryAddress")}</span><h2 id="country-picker-title">{text("chooseDestination")}</h2><p>{text("destinationInstructions")}</p></div><button type="button" className="country-picker-close" onClick={() => setCountryPickerOpen(false)} aria-label={text("close")}><X size={20}/></button></div>
        <div className="country-picker-notice"><MapPin size={16}/><span>{text("deliveryToConfirm")}</span></div>
        <LocateButton onLocated={(place) => { selectCountry(place.countryCode); window.setTimeout(() => { setCountryPickerOpen(false); setCountrySearch(""); }, 1400); }}/>
        <label className="country-picker-search"><Search size={17}/><input autoFocus value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} placeholder={text("searchCountries")}/></label>
        <div className="country-picker-list">
          {filteredCountries.map((item) => {
            const selected = country.code === item.code;
            return <button type="button" className={`country-picker-item ${selected ? "is-selected" : ""}`} key={item.code} onClick={() => chooseCountry(item.code)}>
              <span className="country-picker-code"><CountryFlag code={item.code} size={32}/></span><span className="country-picker-name"><b>{countryName(item.code, language)}</b><small>{item.languageName} · {item.currency}</small></span><span className="country-picker-confirm">{selected ? <><Check size={15}/>{text("selected")}</> : text("deliveryToConfirm")}</span>
            </button>;
          })}
          {filteredCountries.length === 0 && <p className="country-picker-empty">{text("noCountryResults")}</p>}
        </div>
      </section>
    </div>}
  </>;
}
