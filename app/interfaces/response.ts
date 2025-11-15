/**
 * @description: 公共返回格式
 * @return {*}
 */
export interface ResponseInterface {
  code: number
  message: string
  data?: any
  error?: any
}

// code枚举值
export enum SResponseCode {
  Success = 0,
  Failed = 1,
}

export class SResponse implements ResponseInterface {
  // 0: 成功 1: 失败
  code: number
  message: string
  data?: any
  error?: any
  status?: string

  constructor(sResponse: SResponse = { code: 0, message: '操作成功', status: 'success' }) {
    this.code = sResponse.code ?? 0
    this.message = sResponse.message ?? ''
    this.data = sResponse.data ?? ''
    this.error = sResponse.error ?? ''
    this.status = sResponse.status ?? 'success'
  }
}

/**
 * @description: 列表返回格式
 * @return {*}
 */
export interface ListResponseInterface extends ResponseInterface {
  list: []
  count: number
}

export class ListResponse implements ListResponseInterface {
  code: number
  message: string
  list: any
  count: number

  constructor(
    listResponse: ListResponse = {
      code: 0,
      message: '操作成功',
      list: [],
      count: 0,
    }
  ) {
    this.code = listResponse.code ?? 0
    this.message = listResponse.message ?? ''
    this.list = listResponse.list ?? []
    this.count = listResponse.count ?? 0
  }
}
