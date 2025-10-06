// components/LoginForm.js
import { useState, useCallback, memo } from 'react';
import { LogIn, UserPlus, Shield } from 'lucide-react';

const LoginForm = memo(({ onLogin, onRegister, onResetPassword, error, loading }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    isRegistering: false,
    showResetPassword: false,
    resetEmail: '',
    newUser: {
      name: '',
      username: '',
      password: '',
      confirmPassword: ''
    }
  });

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleNewUserChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      newUser: { ...prev.newUser, [field]: value }
    }));
  }, []);

  const handleLogin = useCallback(() => {
    if (formData.username && formData.password) {
      onLogin(formData.username, formData.password);
    }
  }, [formData.username, formData.password, onLogin]);

  const handleRegister = useCallback(() => {
    const { name, username, password, confirmPassword } = formData.newUser;
    if (!name || !username || !password) {
      alert('Compila tutti i campi obbligatori');
      return;
    }
    if (password !== confirmPassword) {
      alert('Le password non corrispondono');
      return;
    }
    // Per la registrazione, usiamo username@dummy.com come email temporanea
    const tempEmail = `${username}@dummy.com`;
    onRegister(tempEmail, password, { name, username });
  }, [formData.newUser, onRegister]);

  const toggleForm = useCallback(() => {
    setFormData(prev => ({ ...prev, isRegistering: !prev.isRegistering }));
  }, []);

  const handleResetPassword = useCallback(() => {
    if (formData.resetEmail) {
      onResetPassword(formData.resetEmail);
    }
  }, [formData.resetEmail, onResetPassword]);

  const toggleResetPassword = useCallback(() => {
    setFormData(prev => ({ ...prev, showResetPassword: !prev.showResetPassword }));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-emerald-600 flex items-center justify-center">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Giancarlo Padel Championship
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {formData.isRegistering ? 'Registrati per partecipare' : 
             formData.showResetPassword ? 'Recupera la tua password' : 
             'Accedi al tuo account'}
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        <div className="mt-8 space-y-6">
          {formData.showResetPassword ? (
            // Form di reset password
            <form onSubmit={(e) => { e.preventDefault(); handleResetPassword(); }} className="space-y-4">
              <div>
                <label htmlFor="resetEmail" className="block text-sm font-medium text-gray-700">
                  Username o Email
                </label>
                <input
                  id="resetEmail"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.resetEmail}
                  onChange={(e) => handleInputChange('resetEmail', e.target.value)}
                  placeholder="Inserisci il tuo username o email"
                />
              </div>

              <button
                onClick={handleResetPassword}
                disabled={loading || !formData.resetEmail}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Invio...
                  </div>
                ) : (
                  <>
                    <span className="mr-2">📧</span>
                    Invia Email di Reset
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={toggleResetPassword}
                  className="text-sm text-gray-600 hover:text-gray-500"
                >
                  ← Torna al login
                </button>
              </div>
            </form>
          ) : formData.isRegistering ? (
            // Form di registrazione
            <form onSubmit={(e) => { e.preventDefault(); handleRegister(); }} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Nome completo
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.newUser.name}
                  onChange={(e) => handleNewUserChange('name', e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.newUser.username}
                  onChange={(e) => handleNewUserChange('username', e.target.value)}
                />
              </div>


              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.newUser.password}
                  onChange={(e) => handleNewUserChange('password', e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Conferma Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.newUser.confirmPassword}
                  onChange={(e) => handleNewUserChange('confirmPassword', e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Registrazione...
                  </div>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Registrati
                  </>
                )}
              </button>
            </form>
          ) : (
            // Form di login
            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Accesso...
                  </div>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Accedi
                  </>
                )}
              </button>
            </form>
          )}

          <div className="text-center space-y-2">
            {!formData.isRegistering && !formData.showResetPassword && (
              <button
                onClick={toggleResetPassword}
                className="text-sm text-blue-600 hover:text-blue-500 block"
              >
                Password dimenticata?
              </button>
            )}
            
            {!formData.showResetPassword && (
              <button
                onClick={toggleForm}
                className="text-sm text-emerald-600 hover:text-emerald-500"
              >
                {formData.isRegistering 
                  ? 'Hai già un account? Accedi' 
                  : 'Non hai un account? Registrati'
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

LoginForm.displayName = 'LoginForm';

export default LoginForm;
