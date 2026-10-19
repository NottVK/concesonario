import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { clearToken } from '@/api/session'
import { afterEach } from 'vitest'

// La primera prueba de cada archivo paga el arranque en frío; 1 s (el valor por defecto) se queda corto en equipos lentos.
configure({ asyncUtilTimeout: 4000 })

// jsdom no implementa showModal()/close() del <dialog> nativo; se simulan con el atributo `open`.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

// jsdom tampoco implementa scrollIntoView.
Element.prototype.scrollIntoView = () => {}

afterEach(() => {
  cleanup()
  clearToken()
  sessionStorage.clear()
  localStorage.clear()
})
