/**
 * @description: 公共返回格式
 * @return {*}
 */
export interface ResponseInterface<TData = unknown, TError = unknown> {
  code: number
  message: string
  data?: TData
  error?: TError
  status?: string
}

// code枚举值
export enum SResponseCode {
  Success = 200,
  Warning = 400,
  Failed = 500,
}

export class SResponse<TData = unknown, TError = unknown> implements ResponseInterface<TData, TError> {
  // 0: 成功 1: 失败
  code: number
  message: string
  data?: TData
  error?: TError
  status?: string

  constructor(
    sResponse: Partial<ResponseInterface<TData, TError>> = { code: 200, message: '操作成功', status: 'success' }
  ) {
    this.code = sResponse.code ?? SResponseCode.Success
    this.message = sResponse.message ?? ''
    this.data = sResponse.data
    this.error = sResponse.error
    this.status =
      sResponse.status ?? (this.code >= 200 && this.code < 300 ? 'success' : this.code >= 400 ? 'error' : 'info')
  }
}

/**
 * @description: 列表返回格式
 * @return {*}
 */
export interface ListResponseInterface<TItem = unknown, TError = unknown> extends ResponseInterface<never, TError> {
  list: TItem[]
  count: number
}

export class ListResponse<TItem = unknown, TError = unknown> implements ListResponseInterface<TItem, TError> {
  code: number
  message: string
  list: TItem[]
  count: number
  status?: string
  error?: TError

  constructor(
    listResponse: Partial<ListResponse<TItem, TError>> = {
      code: 200,
      message: '操作成功',
      list: [],
      count: 0,
      status: 'success',
    }
  ) {
    this.code = listResponse.code ?? SResponseCode.Success
    this.message = listResponse.message ?? ''
    this.list = listResponse.list ?? []
    this.count = listResponse.count ?? 0
    this.status =
      listResponse.status ?? (this.code >= 200 && this.code < 300 ? 'success' : this.code >= 400 ? 'error' : 'info')
    this.error = listResponse.error
  }
}

export type ResponseLike = {
  status: (code: number) => ResponseLike
  json: (body: unknown) => unknown
}

export function sendSResponse<TData = unknown, TError = unknown>(
  response: ResponseLike,
  httpStatus: number,
  payload: Omit<Partial<ResponseInterface<TData, TError>>, 'code'> & { code?: number } = {}
) {
  return response.status(httpStatus).json(new SResponse<TData, TError>({ ...payload, code: payload.code ?? httpStatus }))
}

export function sendListResponse<TItem = unknown, TError = unknown>(
  response: ResponseLike,
  httpStatus: number,
  payload: Omit<Partial<ListResponse<TItem, TError>>, 'code'> & { code?: number } = {}
) {
  return response
    .status(httpStatus)
    .json(new ListResponse<TItem, TError>({ ...payload, code: payload.code ?? httpStatus }))
}
