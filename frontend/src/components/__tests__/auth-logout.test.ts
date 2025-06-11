import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authAPI } from '../../api';

describe('Auth API - Logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('logout', () => {
    it('should call logout endpoint and clear localStorage', async () => {
      // Setup localStorage with token and user
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'test' }));

      // Mock successful logout response
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true, message: 'Erfolgreich abgemeldet' }))
      } as Response);

      await authAPI.logout();

      // Verify API call
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );

      // Verify localStorage is cleared
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });

    it('should clear localStorage even if API call fails', async () => {
      // Setup localStorage
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'test' }));

      // Mock failed logout response
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      // The logout function will throw, but localStorage should still be cleared
      await expect(authAPI.logout()).rejects.toThrow('Network error');

      // Verify localStorage is still cleared
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });

    it('should handle logout when no token exists', async () => {
      // Mock successful response
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ success: true }))
      } as Response);

      await authAPI.logout();

      // Should still clear localStorage (even though it's already empty)
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });

    it('should clear localStorage even with 401 response', async () => {
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'test' }));

      // Mock 401 response (token expired)
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: 'Nicht autorisiert' }))
      } as Response);

      // The logout function will throw, but localStorage should still be cleared
      await expect(authAPI.logout()).rejects.toThrow('Nicht autorisiert');

      // Should still clear localStorage
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });
});
