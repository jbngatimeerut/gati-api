import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const ATTENDANCE_CATEGORY = 'REFERRAL'; // only this meeting category tracks attendance at all

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
        category: ['REFERRAL', 'NORTH_ZONE', 'INTERCHAPTER'].includes(dto.category) ? dto.category : 'REFERRAL',
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

  // Manual override, leadership-only (see controller) — kept as an admin safety valve, but no
  // longer reachable from the member-facing UI. The real attendance path is scanAttendance().
  mark(meetingId: string, memberId: string, status: any) {
    return this.prisma.attendance.upsert({
      where: { meetingId_memberId: { meetingId, memberId } },
      update: { status },
      create: { meetingId, memberId, status },
    });
  }

  // Lazily issues (or returns the existing) one-time QR token for this member+meeting. Only
  // meaningful for REFERRAL meetings — the other categories don't track attendance at all.
  async getOrCreateQr(meetingId: string, memberId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.category !== ATTENDANCE_CATEGORY) throw new BadRequestException('This meeting does not track attendance');
    const existing = await this.prisma.meetingQrCode.findUnique({ where: { meetingId_memberId: { meetingId, memberId } } });
    if (existing) return existing;
    const token = randomBytes(24).toString('base64url');
    return this.prisma.meetingQrCode.create({ data: { meetingId, memberId, token } });
  }

  // The actual attendance-marking path: a leadership member scans another member's personal QR.
  // Physically verifiable (the scanner and the QR-holder must both be in the same room), one-time
  // use (the token is atomically claimed so it can't be replayed or shared as a screenshot), and
  // self-scanning is always rejected — even for leadership marking their own attendance.
  async scanAttendance(scannerId: string, token: string) {
    const qr = await this.prisma.meetingQrCode.findUnique({ where: { token } });
    if (!qr) throw new NotFoundException('Invalid or unrecognized QR code');
    if (qr.memberId === scannerId) throw new ForbiddenException('You cannot mark your own attendance');

    const meeting = await this.prisma.meeting.findUnique({ where: { id: qr.meetingId } });
    if (!meeting || meeting.category !== ATTENDANCE_CATEGORY) throw new BadRequestException('This meeting does not track attendance');
    if (meeting.attendanceClosed) throw new BadRequestException('Attendance for this meeting is already closed');

    // Atomic claim: only succeeds once, closing the race between two near-simultaneous scans.
    const claim = await this.prisma.meetingQrCode.updateMany({
      where: { id: qr.id, used: false },
      data: { used: true, usedAt: new Date(), usedById: scannerId },
    });
    if (claim.count === 0) throw new BadRequestException('This QR code has already been used');

    await this.prisma.attendance.upsert({
      where: { meetingId_memberId: { meetingId: qr.meetingId, memberId: qr.memberId } },
      update: { status: 'PRESENT', markedById: scannerId },
      create: { meetingId: qr.meetingId, memberId: qr.memberId, status: 'PRESENT', markedById: scannerId },
    });

    const member = await this.prisma.member.findUnique({
      where: { id: qr.memberId },
      select: { id: true, name: true, company: true, brandName: true, photoUrl: true },
    });
    return { ok: true, member };
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
    const events = await this.prisma.meeting.findMany({ where: { chapterId, category: ATTENDANCE_CATEGORY }, orderBy: { startsAt: 'asc' }, select: { id: true, title: true, startsAt: true } });
    const members = await this.prisma.member.findMany({ where: { chapterId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, company: true, brandName: true } });
    const att = await this.prisma.attendance.findMany({ where: { meeting: { chapterId, category: ATTENDANCE_CATEGORY } }, select: { meetingId: true, memberId: true, status: true } });
    const grid: any = {};
    for (const a of att) { (grid[a.memberId] = grid[a.memberId] || {})[a.meetingId] = a.status === 'PRESENT' ? 'P' : 'A'; }
    return { events, members, grid };
  }

  // Referral meetings happening around now (day-of), not yet closed — the only category leaders
  // ever need to open the "mark attendance" (scan) screen for.
  async today(chapterId: string) {
    const now = Date.now(); const W = 20 * 3600 * 1000;
    const events = await this.prisma.meeting.findMany({
      where: { chapterId, category: ATTENDANCE_CATEGORY, attendanceClosed: false, startsAt: { gte: new Date(now - W), lte: new Date(now + W) } },
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

  // Anyone not scanned in by now is marked ABSENT — this is what makes attendance final and
  // prevents late/no-show members from being marked present after the fact.
  async closeAttendance(meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId }, select: { chapterId: true, category: true } });
    if (!meeting || meeting.category !== ATTENDANCE_CATEGORY) return { ok: false };
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
