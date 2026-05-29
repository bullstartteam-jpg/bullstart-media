import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';

// bullstart-media — focused media/print pipeline: upload designs → build
// _qr → compose gangsheets. No order management / wallet / products admin.
const navItems = [
  { path: '/', label: 'Design', icon: '🎨' },
  { path: '/convert', label: 'Convert _qr', icon: '⟲', requiresConvert: true },
  { path: '/gangsheet', label: 'Gangsheet', icon: '▦', requiresStaff: true },
  { path: '/media', label: 'Media', icon: '🎬' },
];

export default function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isStaff = user?.role?.slug === 'admin' || user?.role?.slug === 'support';
  const visibleNav = navItems.filter(item => {
    // Both gates must pass when both flags are set (e.g. Convert Label needs
    // staff + convert mode). Module permission only applies when neither
    // flag is set on the item.
    if (item.requiresStaff && !isStaff) return false;
    if (item.requiresConvert && !user?.convert) return false;
    if (item.requiresStaff || item.requiresConvert) return true;
    // Items without a module gate (e.g. Design) are always visible.
    return item.module ? hasPermission(item.module) : true;
  });

  return (
    <div className="flex h-screen bg-[#f5f0eb]">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-neutral-200 flex flex-col shadow-sm">
        <div className="p-4 border-b border-neutral-200 titlebar-drag flex items-center gap-2">
          <img src={logo} alt="BullStart" className="h-8" />
          <h1 className="text-base font-bold text-neutral-800 tracking-wide">BULLSTART<span className="text-orange-500"> MEDIA</span></h1>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {visibleNav.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-orange-500 text-white'
                    : 'text-neutral-600 hover:bg-orange-50 hover:text-orange-600'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-neutral-200">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `block text-left px-2 py-1 rounded transition-colors ${
                isActive ? 'bg-orange-50' : 'hover:bg-orange-50'
              }`
            }
          >
            <div className="text-xs text-neutral-700 font-medium">{user?.name}</div>
            <div className="text-xs text-neutral-400">{user?.role?.name}</div>
          </NavLink>
          <button
            onClick={handleLogout}
            className="w-full text-xs text-neutral-400 hover:text-red-500 py-1 text-left transition-colors mt-1"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
