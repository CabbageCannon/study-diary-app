import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/write", label: "写日记" },
  { to: "/history", label: "历史日记" },
];

export function Navigation() {
  return (
    <nav className="navigation" aria-label="主导航">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <strong>学习日记</strong>
          <span>Daily Notes</span>
        </div>
      </div>

      <div className="nav-links">
        {navItems.map((item) => (
          <NavLink className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")} to={item.to} key={item.to}>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
