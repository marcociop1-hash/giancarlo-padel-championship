// components/LoginForm.js
import { useState, useCallback, memo } from 'react';
import { LogIn, UserPlus, Shield } from 'lucide-react';

const LoginForm = memo(({ onLogin, onRegister, error, loading }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    isRegistering: false,
    newUser: {
      name: '',
      email: '',
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
    if (formData.email && formData.password) {
      onLogin(formData.email, formData.password);
    }
  }, [formData.email, formData.password, onLogin]);

  const handleRegister = useCallback(() => {
    const { name, email, username, password, confirmPassword } = formData.newUser;
    if (!name || !email || !username || !password) {
      alert('Compila tutti i campi obbligatori');
      return;
    }
    if (password !== confirmPassword) {
      alert('Le password non corrispondono');
      return;
    }
    onRegister(email, password, { name, username });
  }, [formData.newUser, onRegister]);

  const toggleForm = useCallback(() => {
    setFormData(prev => ({ ...prev, isRegistering: !prev.isRegistering }));
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
            {formData.isRegistering ? 'Registrati per partecipare' : 'Accedi al tuo account'}
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        <div className="mt-8 space-y-6">
          {formData.isRegistering ? (
            // Form di registrazione
            <div className="space-y-4">
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
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.newUser.email}
                  onChange={(e) => handleNewUserChange('email', e.target.value)}
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
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.newUser.confirmPassword}
                  onChange={(e) => handleNewUserChange('confirmPassword', e.target.value)}
                />
              </div>

              <button
                onClick={handleRegister}
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
            </div>
          ) : (
            // Form di login
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
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
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                />
              </div>

              <button
                onClick={handleLogin}
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
            </div>
          )}

          <div className="text-center">
            <button
              onClick={toggleForm}
              className="text-sm text-emerald-600 hover:text-emerald-500"
            >
              {formData.isRegistering 
                ? 'Hai già un account? Accedi' 
                : 'Non hai un account? Registrati'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

LoginForm.displayName = 'LoginForm';

export default LoginForm;
