import { useState, useEffect } from 'react';
import { supabase, User, Configuration, Shift, CashTransaction } from '../lib/supabase';
import { Settings, Users, Building2, Plus, Edit, Trash2, Eye, EyeOff, Wallet, Database, Download, Mail, Upload, AlertTriangle } from 'lucide-react';

const SUPER_ADMIN_KEY = '842114';

type ConfigTab = 'general' | 'users' | 'cierres' | 'backup';

interface ShiftClosureSummary {
  shift: Shift;
  incomeCash: number;
  incomeTransfer: number;
  incomeQr: number;
  incomeExpensas: number;
  expenseCash: number;
  expenseTransfer: number;
  expenseQr: number;
  expenseExpensas: number;
  expectedCash: number;
  difference: number;
}

export default function Configuracion() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [superKeyInput, setSuperKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');

  const [activeTab, setActiveTab] = useState<ConfigTab>('general');
  const [users, setUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'vendedor' as 'admin' | 'vendedor'
  });

  const [closures, setClosures] = useState<ShiftClosureSummary[]>([]);
  const [loadingClosures, setLoadingClosures] = useState(false);

  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Solo carga datos si el súper admin se autenticó
  useEffect(() => {
    if (isAuthorized) {
      loadUsers();
      loadConfig();
      loadClosures();
    }
  }, [isAuthorized]);

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    setUsers(data || []);
  };

  const loadConfig = async () => {
    const { data } = await supabase
      .from('configuration')
      .select('*')
      .maybeSingle();
    if (data) {
      setConfig(data);
    }
  };

  const loadClosures = async () => {
    setLoadingClosures(true);
    // Traemos últimos turnos cerrados
    const { data: shiftsData } = await supabase
      .from('shifts')
      .select('*')
      .eq('active', false)
      .order('start_date', { ascending: false })
      .limit(50);

    const shifts = (shiftsData || []) as Shift[];

    if (shifts.length === 0) {
      setClosures([]);
      setLoadingClosures(false);
      return;
    }

    const shiftIds = shifts.map((s) => s.id);
    const { data: txData } = await supabase
      .from('cash_transactions')
      .select('*')
      .in('shift_id', shiftIds);

    const txs = (txData || []) as CashTransaction[];

    const summaries: ShiftClosureSummary[] = shifts.map((shift) => {
      const byShift = txs.filter((t) => t.shift_id === shift.id);

      const incomeCash = byShift
        .filter((t) => t.type === 'income' && t.payment_method === 'efectivo')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expenseCash = byShift
        .filter((t) => t.type === 'expense' && t.payment_method === 'efectivo')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const incomeTransfer = byShift
        .filter((t) => t.type === 'income' && t.payment_method === 'transferencia')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expenseTransfer = byShift
        .filter((t) => t.type === 'expense' && t.payment_method === 'transferencia')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const incomeQr = byShift
        .filter((t) => t.type === 'income' && t.payment_method === 'qr')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expenseQr = byShift
        .filter((t) => t.type === 'expense' && t.payment_method === 'qr')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const incomeExpensas = byShift
        .filter((t) => t.type === 'income' && t.payment_method === 'expensas')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expenseExpensas = byShift
        .filter((t) => t.type === 'expense' && t.payment_method === 'expensas')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const openingCash = Number(shift.opening_cash || 0);
      const expectedCash = openingCash + incomeCash - expenseCash;
      const closingCash = Number(shift.closing_cash || 0);
      const difference = closingCash - expectedCash;

      return {
        shift,
        incomeCash,
        incomeTransfer,
        incomeQr,
        incomeExpensas,
        expenseCash,
        expenseTransfer,
        expenseQr,
        expenseExpensas,
        expectedCash,
        difference
      };
    });

    setClosures(summaries);
    setLoadingClosures(false);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingUser) {
      await supabase
        .from('users')
        .update({
          username: userForm.username,
          password: userForm.password,
          full_name: userForm.full_name,
          role: userForm.role,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingUser.id);
    } else {
      await supabase.from('users').insert([userForm]);
    }

    loadUsers();
    setShowUserModal(false);
    setEditingUser(null);
    setUserForm({
      username: '',
      password: '',
      full_name: '',
      role: 'vendedor'
    });
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      password: user.password,
      full_name: user.full_name,
      role: user.role
    });
    setShowUserModal(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este usuario?')) {
      await supabase.from('users').delete().eq('id', id);
      loadUsers();
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    await supabase
      .from('configuration')
      .update({
        business_name: config.business_name,
        address: config.address,
        phone: config.phone,
        tax_id: config.tax_id,
        currency: config.currency,
        receipt_message: config.receipt_message,
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id);

    alert('Configuración guardada correctamente');
    window.location.reload();
  };

  const handleSuperLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (superKeyInput.trim() === SUPER_ADMIN_KEY) {
      setIsAuthorized(true);
      setKeyError('');
      setSuperKeyInput('');
    } else {
      setKeyError('Clave incorrecta. No podés ingresar al módulo.');
    }
  };

  const createBackup = async () => {
    setBackupLoading(true);
    setBackupMessage('Creando backup...');

    try {
      const backup: any = {
        backup_date: new Date().toISOString(),
        system: 'Kiosco Damian POS',
        version: '1.2.0',
        data: {}
      };

      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      backup.data.products = productsData || [];

      const { data: salesData } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });
      backup.data.sales = salesData || [];

      const { data: transactionsData } = await supabase
        .from('cash_transactions')
        .select('*')
        .order('created_at', { ascending: false });
      backup.data.cash_transactions = transactionsData || [];

      const { data: shiftsData } = await supabase
        .from('shifts')
        .select('*')
        .order('start_date', { ascending: false });
      backup.data.shifts = shiftsData || [];

      const { data: usersData } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      backup.data.users = usersData || [];

      const { data: configData } = await supabase
        .from('configuration')
        .select('*')
        .maybeSingle();
      backup.data.configuration = configData ? [configData] : [];

      const { data: movementsData } = await supabase
        .from('inventory_movements')
        .select('*')
        .order('created_at', { ascending: false });
      backup.data.inventory_movements = movementsData || [];

      const backupJson = JSON.stringify(backup, null, 2);
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `backup-kiosco-damian-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const now = new Date().toLocaleString('es-AR');
      setLastBackup(now);
      localStorage.setItem('lastBackup', now);
      setBackupMessage('Backup creado y descargado exitosamente');
      setTimeout(() => setBackupMessage(''), 5000);
    } catch (error) {
      console.error('Error creando backup:', error);
      setBackupMessage('Error al crear el backup. Intenta nuevamente.');
      setTimeout(() => setBackupMessage(''), 5000);
    } finally {
      setBackupLoading(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('lastBackup');
    if (saved) setLastBackup(saved);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        setSelectedFile(file);
        setRestoreMessage('');
      } else {
        setRestoreMessage('Error: Por favor selecciona un archivo JSON válido');
        setSelectedFile(null);
      }
    }
  };

  const handleRestoreBackup = () => {
    if (!selectedFile) {
      setRestoreMessage('Error: No has seleccionado ningún archivo');
      return;
    }
    setShowRestoreConfirm(true);
  };

  const confirmRestore = async () => {
    if (!selectedFile) return;

    setShowRestoreConfirm(false);
    setRestoreLoading(true);
    setRestoreMessage('Restaurando backup...');

    try {
      const fileContent = await selectedFile.text();
      const backup = JSON.parse(fileContent);

      if (!backup.data || !backup.backup_date) {
        throw new Error('Formato de backup inválido');
      }

      setRestoreMessage('Limpiando tablas...');

      await supabase.from('inventory_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('cash_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setRestoreMessage('Restaurando configuración...');
      if (backup.data.configuration && backup.data.configuration.length > 0) {
        await supabase.from('configuration').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('configuration').insert(backup.data.configuration);
      }

      setRestoreMessage('Restaurando usuarios...');
      if (backup.data.users && backup.data.users.length > 0) {
        await supabase.from('users').insert(backup.data.users);
      }

      setRestoreMessage('Restaurando productos...');
      if (backup.data.products && backup.data.products.length > 0) {
        await supabase.from('products').insert(backup.data.products);
      }

      setRestoreMessage('Restaurando turnos...');
      if (backup.data.shifts && backup.data.shifts.length > 0) {
        await supabase.from('shifts').insert(backup.data.shifts);
      }

      setRestoreMessage('Restaurando ventas...');
      if (backup.data.sales && backup.data.sales.length > 0) {
        await supabase.from('sales').insert(backup.data.sales);
      }

      setRestoreMessage('Restaurando movimientos de caja...');
      if (backup.data.cash_transactions && backup.data.cash_transactions.length > 0) {
        await supabase.from('cash_transactions').insert(backup.data.cash_transactions);
      }

      setRestoreMessage('Restaurando movimientos de inventario...');
      if (backup.data.inventory_movements && backup.data.inventory_movements.length > 0) {
        await supabase.from('inventory_movements').insert(backup.data.inventory_movements);
      }

      setRestoreMessage('Backup restaurado exitosamente. La página se recargará en 3 segundos...');
      setSelectedFile(null);

      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      console.error('Error restaurando backup:', error);
      setRestoreMessage(`Error al restaurar el backup: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      setRestoreLoading(false);
    }
  };

  // Pantalla de clave de Súper Administrador
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 text-white">
              <Settings size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                Acceso Súper Administrador
              </h2>
              <p className="text-sm text-slate-500">
                Ingresá la clave para acceder a la configuración del sistema.
              </p>
            </div>
          </div>

          <form onSubmit={handleSuperLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Clave de Súper Administrador
              </label>
              <input
                type="password"
                value={superKeyInput}
                onChange={(e) => setSuperKeyInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-700 focus:border-transparent"
                placeholder="••••••"
                autoFocus
              />
              {keyError && (
                <p className="text-sm text-red-600 mt-2">{keyError}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-black text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all"
            >
              Ingresar
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Si la clave es correcta, se muestra el módulo completo
  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 bg-white rounded-xl p-2 shadow-lg">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'general'
              ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 size={20} />
          Datos del Negocio
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'users'
              ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users size={20} />
          Usuarios
        </button>
        <button
          onClick={() => setActiveTab('cierres')}
          className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'cierres'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Wallet size={20} />
          Cierres de Turno
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'backup'
              ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Database size={20} />
          Backup
        </button>
      </div>

      {/* TAB: GENERAL */}
      {activeTab === 'general' && config && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Building2 className="text-blue-600" size={24} />
            Configuración General
          </h3>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nombre del Negocio *
                </label>
                <input
                  type="text"
                  required
                  value={config.business_name}
                  onChange={(e) =>
                    setConfig({ ...config, business_name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={config.phone}
                  onChange={(e) =>
                    setConfig({ ...config, phone: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Dirección
                </label>
                <input
                  type="text"
                  value={config.address}
                  onChange={(e) =>
                    setConfig({ ...config, address: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  CUIT/RUT
                </label>
                <input
                  type="text"
                  value={config.tax_id}
                  onChange={(e) =>
                    setConfig({ ...config, tax_id: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Símbolo de Moneda
                </label>
                <input
                  type="text"
                  value={config.currency}
                  onChange={(e) =>
                    setConfig({ ...config, currency: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Mensaje en Ticket
              </label>
              <textarea
                value={config.receipt_message}
                onChange={(e) =>
                  setConfig({ ...config, receipt_message: e.target.value })
                }
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all"
            >
              Guardar Configuración
            </button>
          </form>
        </div>
      )}

      {/* TAB: USUARIOS */}
      {activeTab === 'users' && (
        <>
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-800">
              Gestión de Usuarios
            </h3>
            <button
              onClick={() => {
                setEditingUser(null);
                setUserForm({
                  username: '',
                  password: '',
                  full_name: '',
                  role: 'vendedor'
                });
                setShowUserModal(true);
              }}
              className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all"
            >
              <Plus size={20} />
              Nuevo Usuario
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Nombre Completo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">
                      {user.username}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {user.full_name}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {user.role === 'admin'
                          ? 'Administrador'
                          : 'Vendedor'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                          user.active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {user.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB: CIERRES DE TURNO */}
      {activeTab === 'cierres' && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Wallet className="text-emerald-600" size={24} />
              Cierres de Turno
            </h3>
            <button
              onClick={loadClosures}
              className="px-4 py-2 text-sm rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Actualizar
            </button>
          </div>

          {loadingClosures ? (
            <p className="text-sm text-slate-500">Cargando cierres de turno...</p>
          ) : closures.length === 0 ? (
            <p className="text-sm text-slate-500">
              No hay cierres de turno registrados todavía.
            </p>
          ) : (
            <div className="bg-white rounded-xl shadow-inner overflow-x-auto border border-slate-200">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase">
                      Fecha Inicio
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 uppercase">
                      Usuario
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase">
                      Efectivo Inicial
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-700 uppercase">
                      Ing. Efvo
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-700 uppercase">
                      Ing. Transf
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-700 uppercase">
                      Ing. QR
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-emerald-700 uppercase">
                      Ing. Expensas
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-red-700 uppercase">
                      Egr. Efvo
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-red-700 uppercase">
                      Egr. Transf
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-red-700 uppercase">
                      Egr. QR
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-red-700 uppercase">
                      Egr. Expensas
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase">
                      Efvo Final
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 uppercase">
                      Diferencia
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 uppercase">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {closures.map((c) => {
                    const start = new Date(c.shift.start_date);
                    const end = c.shift.end_date
                      ? new Date(c.shift.end_date)
                      : null;
                    const closingCash = Number(c.shift.closing_cash || 0);
                    const diff = c.difference;
                    const isOk = Math.abs(diff) < 0.01;

                    return (
                      <tr
                        key={c.shift.id}
                        className="border-t border-slate-200 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {start.toLocaleString('es-AR')}
                          {end && (
                            <div className="text-[10px] text-slate-500">
                              Cierre: {end.toLocaleString('es-AR')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {c.shift.user_name}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-800">
                          ${Number(c.shift.opening_cash || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700">
                          ${c.incomeCash.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700">
                          ${c.incomeTransfer.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700">
                          ${c.incomeQr.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700">
                          ${c.incomeExpensas.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-700">
                          ${c.expenseCash.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-700">
                          ${c.expenseTransfer.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-700">
                          ${c.expenseQr.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-700">
                          ${c.expenseExpensas.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-800">
                          ${closingCash.toFixed(2)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            isOk
                              ? 'text-emerald-600'
                              : diff > 0
                              ? 'text-blue-600'
                              : 'text-amber-700'
                          }`}
                        >
                          ${diff.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isOk ? (
                            <span className="inline-flex px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                              Caja OK
                            </span>
                          ) : (
                            <span className="inline-flex px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
                              Diferencia
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: BACKUP */}
      {activeTab === 'backup' && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white">
              <Database size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-800">
                Backup de Base de Datos
              </h3>
              <p className="text-sm text-slate-600">
                Protege tus datos con backups automáticos
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-r from-orange-50 to-red-50 border-l-4 border-orange-500 p-4 rounded-lg">
              <h4 className="font-semibold text-orange-900 mb-2">
                ¿Por qué hacer backups?
              </h4>
              <p className="text-sm text-orange-800">
                Los backups te protegen contra pérdidas de datos accidentales, problemas técnicos o fallos del servicio.
                Recomendamos hacer backups diarios y guardarlos en un lugar seguro.
              </p>
            </div>

            {lastBackup && (
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Último backup:</strong> {lastBackup}
                </p>
              </div>
            )}

            <div className="border-2 border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <Download className="text-orange-600 mt-1" size={24} />
                <div className="flex-1">
                  <h4 className="font-bold text-slate-800 mb-2">
                    Backup Manual
                  </h4>
                  <p className="text-sm text-slate-600 mb-4">
                    Descarga un archivo JSON con todos los datos de tu base de datos.
                    Este archivo incluye productos, ventas, movimientos de caja, turnos, usuarios y configuración.
                  </p>
                  <button
                    onClick={createBackup}
                    disabled={backupLoading}
                    className={`px-6 py-3 rounded-xl font-semibold shadow-lg transition-all flex items-center gap-2 ${
                      backupLoading
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white'
                    }`}
                  >
                    <Download size={20} />
                    {backupLoading ? 'Creando backup...' : 'Descargar Backup Ahora'}
                  </button>
                  {backupMessage && (
                    <p className={`text-sm mt-3 ${
                      backupMessage.includes('Error') ? 'text-red-600' : 'text-emerald-600'
                    }`}>
                      {backupMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="border-2 border-red-200 rounded-xl p-6 space-y-4 bg-red-50/30">
              <div className="flex items-start gap-3">
                <Upload className="text-red-600 mt-1" size={24} />
                <div className="flex-1">
                  <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                    Restaurar Backup
                    <span className="text-xs font-normal bg-red-100 text-red-700 px-2 py-1 rounded-full">
                      ¡Cuidado!
                    </span>
                  </h4>
                  <p className="text-sm text-slate-600 mb-4">
                    Sube un archivo de backup para restaurar todos los datos del sistema.
                    <strong className="text-red-700"> Esta acción eliminará todos los datos actuales y los reemplazará con los del backup.</strong>
                  </p>

                  <div className="space-y-3">
                    <div>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFileSelect}
                        disabled={restoreLoading}
                        className="block w-full text-sm text-slate-600
                          file:mr-4 file:py-2.5 file:px-4
                          file:rounded-xl file:border-0
                          file:text-sm file:font-semibold
                          file:bg-slate-100 file:text-slate-700
                          hover:file:bg-slate-200
                          file:cursor-pointer
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      {selectedFile && (
                        <p className="text-xs text-emerald-600 mt-2">
                          Archivo seleccionado: {selectedFile.name}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={handleRestoreBackup}
                      disabled={!selectedFile || restoreLoading}
                      className={`px-6 py-3 rounded-xl font-semibold shadow-lg transition-all flex items-center gap-2 ${
                        !selectedFile || restoreLoading
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white'
                      }`}
                    >
                      <Upload size={20} />
                      {restoreLoading ? 'Restaurando...' : 'Restaurar Backup'}
                    </button>

                    {restoreMessage && (
                      <p className={`text-sm mt-3 ${
                        restoreMessage.includes('Error') ? 'text-red-600' : 'text-blue-600'
                      }`}>
                        {restoreMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-2 border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="text-blue-600 mt-1" size={24} />
                <div className="flex-1">
                  <h4 className="font-bold text-slate-800 mb-2">
                    Envío por Email (Próximamente)
                  </h4>
                  <p className="text-sm text-slate-600 mb-4">
                    Pronto podrás configurar envío automático de backups por email.
                    Esta función te permitirá recibir backups programados directamente en tu casilla de correo.
                  </p>
                  <button
                    disabled
                    className="px-6 py-3 rounded-xl font-semibold shadow-lg bg-slate-200 text-slate-400 cursor-not-allowed flex items-center gap-2"
                  >
                    <Mail size={20} />
                    Configurar Email (Próximamente)
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-100 border border-slate-300 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-800 mb-2">
                Recomendaciones de Backup
              </h4>
              <ul className="text-sm text-slate-700 space-y-1.5">
                <li>• Realiza backups diariamente al finalizar el turno</li>
                <li>• Guarda los archivos de backup en múltiples ubicaciones (PC, USB, nube)</li>
                <li>• Verifica ocasionalmente que los backups se pueden abrir correctamente</li>
                <li>• Mantén al menos los últimos 30 días de backups</li>
                <li>• No elimines backups antiguos hasta tener varios backups nuevos</li>
              </ul>
            </div>

            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Importante:</strong> Los backups descargados contienen información sensible.
                Guárdalos en un lugar seguro y no los compartas públicamente.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMACION RESTAURAR */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl">
            <div className="bg-gradient-to-r from-red-500 to-red-700 p-6 rounded-t-2xl flex items-center gap-3">
              <AlertTriangle className="text-white" size={32} />
              <h3 className="text-2xl font-bold text-white">
                ¡Confirmar Restauración!
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <p className="text-sm text-red-800 font-semibold mb-2">
                  ADVERTENCIA: Esta acción no se puede deshacer
                </p>
                <p className="text-sm text-red-700">
                  Al restaurar este backup, se eliminarán TODOS los datos actuales del sistema y se reemplazarán con los datos del archivo de backup.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                <p className="text-sm text-amber-900 font-semibold mb-2">
                  Se eliminarán y reemplazarán:
                </p>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• Todos los productos y stock actual</li>
                  <li>• Todas las ventas registradas</li>
                  <li>• Todos los movimientos de caja</li>
                  <li>• Todos los turnos</li>
                  <li>• Todos los usuarios</li>
                  <li>• Toda la configuración</li>
                  <li>• Todos los movimientos de inventario</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Archivo seleccionado:</strong> {selectedFile?.name}
                </p>
              </div>

              <p className="text-sm text-slate-600">
                ¿Estás completamente seguro de que querés continuar con la restauración?
              </p>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowRestoreConfirm(false);
                  }}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmRestore}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-red-700 text-white font-semibold rounded-xl hover:from-red-600 hover:to-red-800 shadow-lg"
                >
                  Sí, Restaurar Backup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL USUARIO */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white">
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Usuario *
                </label>
                <input
                  type="text"
                  required
                  value={userForm.username}
                  onChange={(e) =>
                    setUserForm({ ...userForm, username: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Contraseña *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={userForm.password}
                    onChange={(e) =>
                      setUserForm({ ...userForm, password: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={userForm.full_name}
                  onChange={(e) =>
                    setUserForm({ ...userForm, full_name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Rol *
                </label>
                <select
                  required
                  value={userForm.role}
                  onChange={(e) =>
                    setUserForm({
                      ...userForm,
                      role: e.target.value as 'admin' | 'vendedor'
                    })
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="vendedor">Vendedor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserModal(false);
                    setEditingUser(null);
                  }}
                  className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-pink-700 shadow-lg"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
