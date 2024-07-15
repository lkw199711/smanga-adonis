/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-05-07 20:08:19
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-05-09 11:41:17
 * @FilePath: \smanga-node\src\interfaces\response.interface.ts
 * @Description: 公用返回格式
 */

/**
 * @description: 公共返回格式
 * @return {*}
 */
export interface ResponseInterface {
  code: number;
  message: string;
  data?: any;
  error?: any;
}

export class SResponse implements ResponseInterface {
  code: number;
  message: string;
  data?: any;
  error?: any;

  constructor(sResponse: SResponse = { code: 0, message: '操作成功' }) {
    this.code = sResponse.code ?? 0;
    this.message = sResponse.message ?? '';
    this.data = sResponse.data ?? '';
    this.error = sResponse.error ?? '';
  }
}

/**
 * @description: 列表返回格式
 * @return {*}
 */
export interface ListResponseInterface extends ResponseInterface {
  list: [];
  count: number;
}

export class ListResponse implements ListResponseInterface {
  code: number;
  message: string;
  list: any;
  count: number;

  constructor(
    listResponse: ListResponse = {
      code: 0,
      message: '操作成功',
      list: [],
      count: 0,
    },
  ) {
    this.code = listResponse.code ?? 0;
    this.message = listResponse.message ?? '';
    this.list = listResponse.list ?? [];
    this.count = listResponse.count ?? 0;
  }
}
