namespace InternSystem.Core.Entities;

public enum DeviceType
{
    Laptop,
    Phone
}

public class DeviceMac
{
    public int Id { get; set; }
    public int InternId { get; set; }
    public Intern Intern { get; set; } = null!;

    public DeviceType DeviceType { get; set; }
    public string MacAddress { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}