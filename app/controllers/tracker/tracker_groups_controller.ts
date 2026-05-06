import type { HttpContext } from '@adonisjs/core/http'
import { ListResponse, SResponse } from '#interfaces/response'
import trackerGroupService from '#services/tracker/tracker_group_service'
import { log_tracker_error } from '#utils/p2p_log'

/**
 * Tracker 群组管理接口
 * 路由: /tracker/group/*
 */
export default class TrackerGroupsController {
  /**
   * POST /tracker/group
   */
  async create({ request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      const payload = request.only(['groupName', 'describe', 'password', 'maxMembers'])
      const group = await trackerGroupService.create(nodeId, payload)
      return response.json(
        new SResponse({
          code: 0,
          message: '群组创建成功',
          data: {
            groupNo: group.groupNo,
            trackerGroupId: group.trackerGroupId,
            groupName: group.groupName,
            describe: group.describe,
            ownerNodeId: group.ownerNodeId,
            maxMembers: group.maxMembers,
            memberCount: group.memberCount,
            ownerRole: 'owner',
          },
        })
      )
    } catch (err: any) {
      log_tracker_error('group.create', err)
      return response.status(400).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * POST /tracker/group/join
   */
  async join({ request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      const payload = request.only(['groupNo', 'password', 'inviteCode'])
      const group = await trackerGroupService.join(nodeId, payload)
      return response.json(
        new SResponse({
          code: 0,
          message: '加入成功',
          data: {
            trackerGroupId: group.trackerGroupId,
            groupNo: group.groupNo,
            groupName: group.groupName,
            describe: group.describe,
            ownerNodeId: group.ownerNodeId,
            maxMembers: group.maxMembers,
            memberCount: group.memberCount,
          },
        })
      )
    } catch (err: any) {
      log_tracker_error('group.join', err)
      return response.status(400).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * POST /tracker/group/:groupNo/leave
   */
  async leave({ params, request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      await trackerGroupService.leave(nodeId, params.groupNo)
      return response.json(new SResponse({ code: 0, message: '已退出群组' }))
    } catch (err: any) {
      log_tracker_error('group.leave', err)
      return response.status(400).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * GET /tracker/group?mine=1
   */
  async index({ request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      const list = await trackerGroupService.listMine(nodeId)
      return response.json(
        new ListResponse({ code: 0, message: '', list: list as any, count: list.length })
      )
    } catch (err: any) {
      log_tracker_error('group.listMine', err)
      return response.status(500).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * GET /tracker/group/:groupNo/members
   */
  async members({ params, response }: HttpContext) {
    try {
      const list = await trackerGroupService.listMembers(params.groupNo)
      return response.json(
        new ListResponse({ code: 0, message: '', list: list as any, count: list.length })
      )
    } catch (err: any) {
      log_tracker_error('group.members', err)
      return response.status(404).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * DELETE /tracker/group/:groupNo/member/:nodeId
   */
  async kick({ params, request, response }: HttpContext) {
    try {
      const operator = (request as any).trackerNodeId as string
      await trackerGroupService.kick(operator, params.groupNo, params.nodeId)
      return response.json(new SResponse({ code: 0, message: '已移出群组' }))
    } catch (err: any) {
      log_tracker_error('group.kick', err)
      return response.status(400).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * DELETE /tracker/group/:groupNo  —— 群主解散群组
   */
  async dismiss({ params, request, response }: HttpContext) {
    try {
      const operator = (request as any).trackerNodeId as string
      const data = await trackerGroupService.dismiss(operator, params.groupNo)
      return response.json(new SResponse({ code: 0, message: '群组已解散', data }))
    } catch (err: any) {
      log_tracker_error('group.dismiss', err)
      return response.status(400).json(new SResponse({ code: 1, message: err.message }))
    }
  }

  /**
   * POST /tracker/group/:groupNo/invite
   */
  async invite({ params, request, response }: HttpContext) {
    try {
      const operator = (request as any).trackerNodeId as string
      const { expiresHours } = request.only(['expiresHours'])
      const data = await trackerGroupService.createInvite(
        operator,
        params.groupNo,
        expiresHours
      )
      return response.json(new SResponse({ code: 0, message: '邀请码生成成功', data }))
    } catch (err: any) {
      log_tracker_error('group.invite', err)
      return response.status(400).json(new SResponse({ code: 1, message: err.message }))
    }
  }
}