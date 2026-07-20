import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MeetingsService {
  constructor(private prisma: PrismaService) {}

  upcoming(chapterId: string) {
    return this.prisma.meeting.findMany({
      where: { chapterId, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
    });
  }

  create(actor: any, dto: any) {
    return this.prisma.meeting.create({
      data: {
        chapterId: dto.chapterId || actor.chapterId,
        title: dto.title,
        startsAt: new Date(dto.startsAt),
        location: dto.location || null,
        type: dto.type === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL',
        description: dto.description || null,
        feeAmount: dto.feeAmount ? Number(dto.feeAmount) : null,
        upiId: dto.upiId || null,
        bankDetails: dto.bankDetails || null,
      },
    });
  }

  detail(id: string) {
    return this.prisma.meeting.findUnique({ where: { id } });
  }

  async markPaid(meetingId: string, memberId: string) {
    await this.prisma.attendance.upsert({
      where: { meetingId_memberId: { meetingId, memberId } },
      update: { paid: true, paidAt: new Date() },
      create: { meetingId, memberId, status: 'PRESENT', paid: true, paidAt: new Date() },
    });
    return { ok: true };
  }

  mark(meetingId: string, memberId: string, status: any) {
    return this.prisma.attendance.upsert({
      where: { meetingId_memberId: { meetingId, memberId } },
      update: { status },
      create: { meetingId, memberId, status },
    });
  }

  // Leadership only: full attendance roster for a meeting.
  roster(meetingId: string) {
    return this.prisma.attendance.findMany({
      where: { meetingId },
      include: { member: { select: { name: true, company: true, category: true } } },
      orderBy: { member: { name: 'asc' } },
    });
  }

  async rate(memberId: string) {
    const total = await this.prisma.attendance.count({ where: { memberId } });
    const present = await this.prisma.attendance.count({
      where: { memberId, status: { in: ['PRESENT', 'SUBSTITUTE'] } },
    });
    return { total, present, rate: total ? Math.round((present / total) * 100) : 0 };
  }

  async attendanceMatrix(chapterId: string) {
    const events = await this.prisma.meeting.findMany({ where: { chapterId, type: 'INTERNAL' }, orderBy: { startsAt: 'asc' }, select: { id: true, title: true, startsAt: true } });
    const members = await this.prisma.member.findMany({ where: { chapterId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
    const att = await this.prisma.attendance.findMany({ where: { meeting: { chapterId, type: 'INTERNAL' } }, select: { meetingId: true, memberId: true, status: true } });
    const grid: any = {};
    for (const a of att) { (grid[a.memberId] = grid[a.memberId] || {})[a.meetingId] = a.status === 'PRESENT' ? 'P' : 'A'; }
    return { events, members, grid };
  }

  // Internal events happening around now (day-of), not yet closed.
  async today(chapterId: string) {
    const now = Date.now(); const W = 20 * 3600 * 1000;
    const events = await this.prisma.meeting.findMany({
      where: { chapterId, type: 'INTERNAL', attendanceClosed: false, startsAt: { gte: new Date(now - W), lte: new Date(now + W) } },
      orderBy: { startsAt: 'asc' }, select: { id: true, title: true, startsAt: true, location: true },
    });
    return { events };
  }

  async attendanceList(meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId }, select: { chapterId: true, title: true, startsAt: true, attendanceClosed: true } });
    if (!meeting) return { members: [], closed: true };
    const members = await this.prisma.member.findMany({ where: { chapterId: meeting.chapterId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, company: true } });
    const att = await this.prisma.attendance.findMany({ where: { meetingId }, select: { memberId: true, status: true } });
    const present = new Set(att.filter((a) => a.status === 'PRESENT').map((a) => a.memberId));
    return { title: meeting.title, startsAt: meeting.startsAt, closed: meeting.attendanceClosed, members: members.map((m) => ({ ...m, present: present.has(m.id) })) };
  }

  async closeAttendance(meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId }, select: { chapterId: true } });
    if (!meeting) return { ok: false };
    const members = await this.prisma.member.findMany({ where: { chapterId: meeting.chapterId, active: true }, select: { id: true } });
    const att = await this.prisma.attendance.findMany({ where: { meetingId }, select: { memberId: true, status: true } });
    const marked = new Set(att.filter((a) => a.status === 'PRESENT').map((a) => a.memberId));
    for (const m of members) {
      if (!marked.has(m.id)) {
        await this.prisma.attendance.upsert({ where: { meetingId_memberId: { meetingId, memberId: m.id } }, update: { status: 'ABSENT' }, create: { meetingId, memberId: m.id, status: 'ABSENT' } });
      }
    }
    await this.prisma.meeting.update({ where: { id: meetingId }, data: { attendanceClosed: true } });
    return { ok: true };
  }
}
