import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const FuturisticTempleLogin: React.FC = () => {
  const { login } = useAuth() as any;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim()) {
      toast.error('Please enter your username');
      return;
    }

    if (!password) {
      toast.error('Please enter your password');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      toast.success('Welcome back!');
    } catch (error: any) {
      const message = error?.message || 'Invalid credentials. Please try again.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen w-full bg-gray-900 text-white p-4"
      style={{
        backgroundImage:
          "url('https://www.transparenttextures.com/patterns/az-subtle.png'), linear-gradient(to right bottom, #1a202c, #2d3748, #4a5568)",
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="absolute inset-0 bg-black opacity-50 z-0" />

      <Card className="w-full max-w-md bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-2xl shadow-purple-500/10 z-10">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-purple-400"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <CardTitle className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
            Sanctum Access
          </CardTitle>
          <CardDescription className="text-gray-400">
            Sign in with your administrator credentials to continue.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-300">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="admin"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={isSubmitting}
                className="bg-slate-800/60 border-purple-500/40 focus:border-purple-400 focus:ring-purple-400 text-white placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
                  className="bg-slate-800/60 border-purple-500/40 focus:border-purple-400 focus:ring-purple-400 pr-12 text-white placeholder:text-gray-400"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute inset-y-0 right-1 flex items-center text-xs text-purple-300 hover:text-purple-100"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Passwords expire every 24 hours. You will be prompted to sign in again after that window.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-purple-500 hover:bg-purple-600 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Authenticating…' : 'Sign In Securely'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default FuturisticTempleLogin;
