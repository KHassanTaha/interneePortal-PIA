namespace InternSystem.Core.Entities;

public class ReasonCode
{
    public string Code { get; set; } = string.Empty;
    public string SimplifiedIntern { get; set; } = string.Empty;
    public string SimplifiedMentor { get; set; } = string.Empty;
    public string SimplifiedAdmin { get; set; } = string.Empty;
    public string Technical { get; set; } = string.Empty;
    public string RemedyIntern { get; set; } = string.Empty;
    public string RemedyMentor { get; set; } = string.Empty;
    public string RemedyAdmin { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
    public long? UpdatedByUserId { get; set; }
}
