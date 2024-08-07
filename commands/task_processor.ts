/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-22 11:59:08
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-22 14:09:43
 * @FilePath: \smanga-adonis\commands\taskProcessor.ts
 */
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class TaskProcessor extends BaseCommand {
  static commandName = 'task:processor'
  static description = 'Process tasks from the queue'

  static options: CommandOptions = {}

  async run() {
    this.logger.info('Hello world from "TaskProcessor"')
  }
}