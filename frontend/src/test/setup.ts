import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

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
  sessionStorage.clear()
  localStorage.clear()
})
