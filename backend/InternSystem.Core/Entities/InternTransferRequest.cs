namespace InternSystem.Core.Entities;

public enum InternTransferInitiator
{
    Admin,
    Mentor
}

public enum InternTransferStatus
{
    Pending,        // Awaiting endorsement
    Endorsed,       // Admin or current mentor endorsed; awaiting intern acceptance
    InternAccepted, // Intern accepted; awaiting new mentor finalise
    Finalised,      // New mentor applied the transfer
    Rejected
}

public class InternTransferRequest
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;

    public int FromMentorId { get; set; }
    public Mentor FromMentor { get; set; } = null!;

    public int ToMentorId { get; set; }
    public Mentor ToMentor { get; set; } = null!;

    // Who started the request: admin (Flow A) or current mentor (Flow B)
    public InternTransferInitiator InitiatedBy { get; set; }
    public int InitiatedByUserId { get; set; }
    public User InitiatedByUser { get; set; } = null!;

    public InternTransferStatus Status { get; set; } = InternTransferStatus.Pending;

    // The endorser is the OPPOSITE party of the initiator:
    //   Flow A (admin init):   current mentor endorses
    //   Flow B (mentor init):  admin endorses
    public int? EndorsedByUserId { get; set; }
    public User? EndorsedByUser { get; set; }
    public DateTime? EndorsedAt { get; set; }

    public DateTime? InternAcceptedAt { get; set; }

    // Only the target (ToMentor) can finalise
    public int? FinalisedByUserId { get; set; }
    public User? FinalisedByUser { get; set; }
    public DateTime? FinalisedAt { get; set; }

    public string? Notes { get; set; }
    public string? RejectionReason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}