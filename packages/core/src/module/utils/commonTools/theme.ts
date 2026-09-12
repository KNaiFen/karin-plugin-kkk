import { Config } from '@/module/utils/Config'

export const useDarkTheme = (): boolean => {
  let dark = true
  const configTheme = Config.app.Theme
  if (configTheme === 0) {
    const currentHour = new Date().getHours()
    if (currentHour >= 6 && currentHour < 18) {
      dark = false
    }
  } else if (configTheme === 1) {
    dark = false
  } else if (configTheme === 2) {
    dark = true
  }
  return dark
}
