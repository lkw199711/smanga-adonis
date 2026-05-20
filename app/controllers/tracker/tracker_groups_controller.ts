import type { HttpContext } from '@adonisjs/core/http'
import trackerGroupService from '#services/tracker/tracker_group_service'
import { log_tracker_error, log_tracker_info } from '#utils/p2p_log'
import {
  createTrackerGroupValidator,
  joinTrackerGroupValidator,
  inviteTrackerGroupValidator,
  trackerGroupNoParamValidator,
  trackerGroupKickParamValidator,
} from '#validators/tracker'

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
      const payload = await createTrackerGroupValidator.validate(request.all())
      const group = await trackerGroupService.create(nodeId, payload)
      log_tracker_info('group.create', {
        nodeId,
        groupNo: group.groupNo,
        trackerGroupId: group.trackerGroupId,
        maxMembers: group.maxMembers,
      })
      return response.json(
        {
          code: 200,
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
        }
      )
    } catch (err: any) {
      log_tracker_error('group.create', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }

  /**
   * POST /tracker/group/join
   */
  async join({ request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      const payload = await joinTrackerGroupValidator.validate(request.all())
      const group = await trackerGroupService.join(nodeId, payload)
      log_tracker_info('group.join', {
        nodeId,
        groupNo: group.groupNo,
        trackerGroupId: group.trackerGroupId,
      })
      return response.json(
        {
          code: 200,
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
        }
      )
    } catch (err: any) {
      log_tracker_error('group.join', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }

  /**
   * POST /tracker/group/:groupNo/leave
   */
  async leave({ params, request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      const { groupNo } = await trackerGroupNoParamValidator.validate(params)
      await trackerGroupService.leave(nodeId, groupNo)
      log_tracker_info('group.leave', { nodeId, groupNo })
      return response.json({ code: 200, message: '已退出群组' })
    } catch (err: any) {
      log_tracker_error('group.leave', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }

  /**
   * GET /tracker/group?mine=1
   */
  async index({ request, response }: HttpContext) {
    try {
      const nodeId = (request as any).trackerNodeId as string
      const list = await trackerGroupService.listMine(nodeId)
      log_tracker_info('group.listMine', { nodeId, count: list.length })
      return response.json(
        { code: 200, message: '', list: list as any, count: list.length }
      )
    } catch (err: any) {
      log_tracker_error('group.listMine', err)
      return response.status(500).json({ code: 500, message: err.message })
    }
  }

  /**
   * GET /tracker/group/:groupNo/members
   */
  async members({ params, response }: HttpContext) {
    try {
      const { groupNo } = await trackerGroupNoParamValidator.validate(params)
      const list = await trackerGroupService.listMembers(groupNo)
      log_tracker_info('group.members', { groupNo, count: list.length })
      return response.json(
        { code: 200, message: '', list: list as any, count: list.length }
      )
    } catch (err: any) {
      log_tracker_error('group.members', err)
      return response.status(404).json({ code: 404, message: err.message })
    }
  }

  /**
   * DELETE /tracker/group/:groupNo/member/:nodeId
   */
  async kick({ params, request, response }: HttpContext) {
    try {
      const operator = (request as any).trackerNodeId as string
      const { groupNo, nodeId } = await trackerGroupKickParamValidator.validate(params)
      await trackerGroupService.kick(operator, groupNo, nodeId)
      log_tracker_info('group.kick', { operator, groupNo, nodeId })
      return response.json({ code: 200, message: '已移出群组' })
    } catch (err: any) {
      log_tracker_error('group.kick', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }

  /**
   * DELETE /tracker/group/:groupNo  —— 群主解散群组
   */
  async dismiss({ params, request, response }: HttpContext) {
    try {
      const operator = (request as any).trackerNodeId as string
      const { groupNo } = await trackerGroupNoParamValidator.validate(params)
      const data = await trackerGroupService.dismiss(operator, groupNo)
      log_tracker_info('group.dismiss', { operator, groupNo })
      return response.json({ code: 200, message: '群组已解散', data })
    } catch (err: any) {
      log_tracker_error('group.dismiss', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }

  /**
   * POST /tracker/group/:groupNo/invite
   */
  async invite({ params, request, response }: HttpContext) {
    try {
      const operator = (request as any).trackerNodeId as string
      const { groupNo } = await trackerGroupNoParamValidator.validate(params)
      const { expiresHours } = await inviteTrackerGroupValidator.validate(request.all())
      const data = await trackerGroupService.createInvite(
        operator,
        groupNo,
        expiresHours
      )
      log_tracker_info('group.invite', {
        operator,
        groupNo,
        expiresHours: expiresHours ?? null,
      })
      return response.json({ code: 200, message: '邀请码生成成功', data })
    } catch (err: any) {
      log_tracker_error('group.invite', err)
      return response.status(400).json({ code: 400, message: err.message })
    }
  }
}
