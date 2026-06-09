import { expect, test } from '@playwright/test'
import { ANONYMOUS_STATE, completeStepUp, login } from './helpers'

/** A minimal but valid 1×1 PNG for the avatar upload. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * ADMIN-002 — change an account profile basic and confirm it persists.
 */
test.describe('account', () => {
  test.describe('profile basics', () => {
    test.use({ storageState: ANONYMOUS_STATE })

    test('updates a display name that persists (ADMIN-002)', async ({ page }) => {
      const displayName = `Owner ${Date.now().toString(36)}`

      await login(page)
      await page.goto('/admin/account')
      await page.getByTestId('account-tab-profile').click()

      await page.getByTestId('profile-display-name').fill(displayName)
      await page.getByTestId('profile-save').click()
      await completeStepUp(page)
      await expect(page.getByTestId('profile-status')).toHaveText(/profile saved/i, {
        timeout: 20_000,
      })

      await page.reload()
      await page.getByTestId('account-tab-profile').click()
      await expect(page.getByTestId('profile-display-name')).toHaveValue(displayName)
    })
  })

  test('uploads a profile picture that persists (ADMIN-002)', async ({ page }) => {
    await page.goto('/admin/account')
    await page.getByTestId('account-tab-profile').click()

    // The file input is hidden behind the upload button; set files on it directly.
    await page
      .getByTestId('profile-avatar-file')
      .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG_1X1 })
    await expect(page.getByTestId('profile-status')).toHaveText(/updated/i, {
      timeout: 20_000,
    })

    // After reload the avatar is still set — the Remove action is available.
    await page.reload()
    await page.getByTestId('account-tab-profile').click()
    await expect(page.getByTestId('profile-avatar-remove')).toBeVisible()
  })
})
