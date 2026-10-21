import { getToken } from '#/context/authContext'

export interface ApiResponseDto<T = null> {
  success: boolean
  message: string
  data: T
}

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponseDto<T>> {
  const headers = new Headers(options.headers)
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  let body: ApiResponseDto<T>
  try {
    body = (await response.json()) as ApiResponseDto<T>
  } catch {
    throw new Error('Invalid server response')
  }

  return body
}

/** Multipart upload — does not set Content-Type so the browser can add the boundary. */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: { method?: 'POST' | 'PATCH' } = {},
): Promise<ApiResponseDto<T>> {
  return apiFetch<T>(path, {
    method: options.method ?? 'POST',
    body: formData,
  })
}

/** Multipart upload with XHR progress (loaded/total → 0–100). */
export function apiUploadWithProgress<T>(
  path: string,
  formData: FormData,
  options: {
    method?: 'POST' | 'PATCH'
    onProgress?: (percent: number) => void
  } = {},
): Promise<ApiResponseDto<T>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(options.method ?? 'POST', `${API_BASE_URL}${path}`)

    const token = getToken()
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !options.onProgress) return
      const percent = Math.min(
        100,
        Math.round((event.loaded / event.total) * 100),
      )
      options.onProgress(percent)
    }

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as ApiResponseDto<T>
        resolve(body)
      } catch {
        reject(new Error('Invalid server response'))
      }
    }

    xhr.onerror = () => {
      reject(new Error('Unable to reach the server'))
    }

    xhr.send(formData)
  })
}

export function toAbsoluteMediaUrl(path: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${API_BASE_URL}${path}`
}

/** Authenticated binary download (e.g. project documents). */
export async function apiDownload(path: string, fallbackFilename: string) {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { headers })
  if (!response.ok) {
    let message = 'Download failed'
    try {
      const body = (await response.json()) as ApiResponseDto
      if (body.message) message = body.message
    } catch {
      /* not JSON */
    }
    throw new Error(message)
  }

  const disposition = response.headers.get('Content-Disposition')
  const match = disposition?.match(/filename="([^"]+)"/)
  const filename = match?.[1] || fallbackFilename
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
